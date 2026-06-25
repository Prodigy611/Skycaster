exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let w;
  try {
    w = JSON.parse(event.body || '{}').weather;
    if (!w) throw new Error();
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad request.' }) };
  }

  // Step 1 — Expert system runs instantly as base
  const expertActivities = getActivities(w);

  // Step 2 — Try Hugging Face to enhance, fall back to expert if it fails
  const hfKey = process.env.HF_API_KEY;
  if (hfKey) {
    try {
      const prompt = `<s>[INST] Weather: ${w.description}, ${w.temp}°C feels ${w.feelsLike}°C, humidity ${w.humidity}%, wind ${w.wind}km/h. Location: ${w.name}, ${w.country}.
Give 6 activity suggestions as a JSON array. Each: {emoji,title,description,tag}. title=max 5 words, description=1 sentence, tag=Outdoor|Indoor|Social|Wellness|Food|Creative. JSON only. [/INST]`;

      const res = await fetch('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${hfKey}`,
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 512,
            temperature: 0.7,
            return_full_text: false,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const raw = data[0]?.generated_text || '';
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) {
          const aiActivities = JSON.parse(match[0]);
          // Merge — use AI suggestions but fill any gaps with expert system
          const merged = aiActivities.slice(0, 6).map((a, i) => ({
            emoji: a.emoji || expertActivities[i]?.emoji || '🌤️',
            title: a.title || expertActivities[i]?.title || 'Activity',
            description: a.description || expertActivities[i]?.description || '',
            tag: a.tag || expertActivities[i]?.tag || 'Outdoor',
            source: 'ai',
          }));
          return { statusCode: 200, headers, body: JSON.stringify({ activities: merged, source: 'ai' }) };
        }
      }
    } catch (err) {
      // HF failed — fall through to expert system silently
      console.log('HF failed, using expert system:', err.message);
    }
  }

  // Step 3 — Return expert system results (instant fallback)
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ activities: expertActivities, source: 'expert' }),
  };
};

function getActivities(w) {
  const temp = w.temp;
  const desc = w.description.toLowerCase();
  const humidity = w.humidity;
  const wind = w.wind;

  const isRaining = desc.includes('rain') || desc.includes('drizzle') || desc.includes('shower');
  const isStormy  = desc.includes('storm') || desc.includes('thunder');
  const isCloudy  = desc.includes('cloud') || desc.includes('overcast');
  const isFoggy   = desc.includes('fog') || desc.includes('mist') || desc.includes('haze');
  const isClear   = desc.includes('clear') || desc.includes('sunny');
  const isSnowy   = desc.includes('snow') || desc.includes('blizzard') || desc.includes('sleet');
  const isHot     = temp >= 30;
  const isWarm    = temp >= 22 && temp < 30;
  const isCool    = temp >= 15 && temp < 22;
  const isCold    = temp < 15;
  const isWindy   = wind >= 30;
  const isHumid   = humidity >= 80;

  if (isStormy) {
    return [
      { emoji: '🎬', title: 'Movie Marathon at Home', description: 'Stay safe indoors and enjoy a long movie session while the storm passes outside.', tag: 'Indoor' },
      { emoji: '📚', title: 'Read a Good Book', description: 'Curl up with a book you have been meaning to finish — perfect storm weather reading.', tag: 'Indoor' },
      { emoji: '🍲', title: 'Cook a Warm Meal', description: 'Try a new recipe and enjoy hot comfort food while the thunder rolls outside.', tag: 'Food' },
      { emoji: '🎮', title: 'Play Video Games', description: 'A great time to catch up on your favourite games indoors away from the storm.', tag: 'Indoor' },
      { emoji: '🧘', title: 'Indoor Meditation', description: 'Use the sound of rain and thunder as a natural backdrop for deep relaxation.', tag: 'Wellness' },
      { emoji: '📝', title: 'Journal or Write', description: 'Stormy weather is great creative fuel — write your thoughts, stories, or plans.', tag: 'Creative' },
    ];
  }

  if (isSnowy) {
    return [
      { emoji: '⛄', title: 'Build a Snowman', description: 'Bundle up and enjoy the snow by building a classic snowman outside.', tag: 'Outdoor' },
      { emoji: '🍵', title: 'Hot Drinks Indoors', description: 'Warm up with hot cocoa, tea, or coffee by a window watching the snow fall.', tag: 'Food' },
      { emoji: '📸', title: 'Snow Photography', description: 'Capture the beautiful snowy scenery — great light and unique shots available.', tag: 'Creative' },
      { emoji: '🧣', title: 'Dress Up and Walk', description: 'Wrap up warm and take a peaceful walk through the snow-covered surroundings.', tag: 'Outdoor' },
      { emoji: '🎨', title: 'Paint the Snow Scene', description: 'Set up by a window and paint or sketch the winter landscape outside.', tag: 'Creative' },
      { emoji: '🛋️', title: 'Cozy Indoor Workout', description: 'Stay warm with an indoor yoga or stretching routine on a cold snowy day.', tag: 'Wellness' },
    ];
  }

  if (isRaining) {
    if (isHot) {
      return [
        { emoji: '🎵', title: 'Listen to Music Indoors', description: 'Hot and rainy outside — stay cool inside with your favourite playlist.', tag: 'Indoor' },
        { emoji: '🍹', title: 'Make Cold Drinks', description: 'Blend smoothies or juices to beat the heat while waiting for the rain to stop.', tag: 'Food' },
        { emoji: '🛁', title: 'Relaxing Bath or Shower', description: 'A refreshing cool shower is perfect when it is hot and rainy outside.', tag: 'Wellness' },
        { emoji: '📱', title: 'Learn Something Online', description: 'Use the indoor time productively with a free online course or tutorial.', tag: 'Indoor' },
        { emoji: '🎨', title: 'Creative Art Project', description: 'Rain and heat make for great creative energy — start a drawing or craft.', tag: 'Creative' },
        { emoji: '🧹', title: 'Organise Your Space', description: 'Tidy and rearrange your room or workspace while it rains outside.', tag: 'Indoor' },
      ];
    }
    return [
      { emoji: '☕', title: 'Café Visit', description: 'Head to a nearby café, grab a warm drink and enjoy the rainy atmosphere.', tag: 'Social' },
      { emoji: '📚', title: 'Visit the Library', description: 'A rainy day is perfect for spending time reading or studying at the library.', tag: 'Indoor' },
      { emoji: '🎲', title: 'Board Games with Friends', description: 'Invite friends over for board games — great fun on a rainy indoor day.', tag: 'Social' },
      { emoji: '🍜', title: 'Cook Comfort Food', description: 'Warm soup or stew is the perfect meal to cook and eat on a rainy day.', tag: 'Food' },
      { emoji: '🧘', title: 'Yoga or Stretching', description: 'Use the quiet rainy day energy for a calming indoor yoga session.', tag: 'Wellness' },
      { emoji: '🎬', title: 'Watch a Documentary', description: 'Expand your knowledge with an interesting documentary while it rains.', tag: 'Indoor' },
    ];
  }

  if (isFoggy) {
    return [
      { emoji: '📸', title: 'Fog Photography Walk', description: 'Misty conditions create incredibly atmospheric and dramatic photos — grab your camera.', tag: 'Creative' },
      { emoji: '🚶', title: 'Mindful Morning Walk', description: 'A quiet foggy walk is peaceful and great for clearing your mind.', tag: 'Wellness' },
      { emoji: '☕', title: 'Morning Coffee Outside', description: 'Sit outside with a warm drink and enjoy the calm misty atmosphere.', tag: 'Food' },
      { emoji: '📖', title: 'Read by the Window', description: 'Foggy weather outside makes staying in with a good book extra cosy.', tag: 'Indoor' },
      { emoji: '🎨', title: 'Sketch the Misty Scene', description: 'Fog creates a unique visual mood — great inspiration for sketching or painting.', tag: 'Creative' },
      { emoji: '🧘', title: 'Meditation Session', description: 'The quiet misty environment is ideal for a peaceful mindfulness session.', tag: 'Wellness' },
    ];
  }

  if (isClear || (!isRaining && !isCloudy)) {
    if (isHot && isHumid) {
      return [
        { emoji: '🏊', title: 'Go Swimming', description: `At ${temp}°C with ${humidity}% humidity, a pool or beach swim is the best way to cool down.`, tag: 'Outdoor' },
        { emoji: '🍦', title: 'Get Ice Cream', description: 'Beat the hot humid weather with a cold ice cream treat from a nearby spot.', tag: 'Food' },
        { emoji: '🌅', title: 'Early Morning Walk', description: 'Exercise early before the heat peaks — much more comfortable before 8am.', tag: 'Outdoor' },
        { emoji: '💆', title: 'Spa or Self-Care', description: 'Stay cool indoors with a relaxing self-care routine on this hot humid day.', tag: 'Wellness' },
        { emoji: '🥤', title: 'Stay Hydrated', description: 'Visit a juice bar or make fresh fruit drinks to stay hydrated in the heat.', tag: 'Food' },
        { emoji: '🏬', title: 'Visit a Mall', description: 'Air-conditioned shopping centers are a great escape from hot humid weather.', tag: 'Indoor' },
      ];
    }
    if (isHot) {
      return [
        { emoji: '🏖️', title: 'Beach or Pool Day', description: `Perfect ${temp}°C beach weather — get out and enjoy the sun and water.`, tag: 'Outdoor' },
        { emoji: '🚴', title: 'Morning Bike Ride', description: 'Get out early for a bike ride before the afternoon heat gets too intense.', tag: 'Outdoor' },
        { emoji: '🌳', title: 'Picnic in the Park', description: 'Pack some food and find a shaded spot in the park for a lovely picnic.', tag: 'Social' },
        { emoji: '📸', title: 'Outdoor Photography', description: 'Bright sunny conditions make for great outdoor portrait and landscape photos.', tag: 'Creative' },
        { emoji: '🍉', title: 'Fresh Fruit Snacks', description: 'Stock up on watermelon, mangoes and cold fruits to enjoy in the sunshine.', tag: 'Food' },
        { emoji: '🧴', title: 'Sunbathe Responsibly', description: 'Enjoy the sun with proper sunscreen — relax and soak up some vitamin D.', tag: 'Wellness' },
      ];
    }
    if (isWarm) {
      return [
        { emoji: '🚶', title: 'Scenic Outdoor Walk', description: `${temp}°C is ideal walking weather — explore a new area or your favourite route.`, tag: 'Outdoor' },
        { emoji: '⚽', title: 'Play Outdoor Sports', description: 'Perfect temperature for football, basketball or any outdoor sport with friends.', tag: 'Outdoor' },
        { emoji: '🌿', title: 'Visit a Park or Garden', description: 'Warm sunny weather is great for relaxing in a park or botanical garden.', tag: 'Outdoor' },
        { emoji: '🍽️', title: 'Outdoor Dining', description: 'Find a restaurant with outdoor seating and enjoy a meal in the warm air.', tag: 'Food' },
        { emoji: '📸', title: 'Photography Outing', description: 'Great light and warm weather — perfect for a photography walk around town.', tag: 'Creative' },
        { emoji: '🧺', title: 'Picnic with Friends', description: 'Gather friends, pack some food and enjoy the warm weather in a green space.', tag: 'Social' },
      ];
    }
    if (isCool) {
      return [
        { emoji: '🏃', title: 'Go for a Run', description: `${temp}°C is perfect running temperature — cool enough to push yourself hard.`, tag: 'Outdoor' },
        { emoji: '🚵', title: 'Cycling or Hiking', description: 'Cool clear weather is ideal for a long bike ride or nature hike.', tag: 'Outdoor' },
        { emoji: '☕', title: 'Outdoor Café Sit', description: 'Enjoy the cool fresh air at an outdoor café with a warm drink.', tag: 'Social' },
        { emoji: '📷', title: 'Landscape Photography', description: 'Cool clear skies produce stunning landscape and nature photography conditions.', tag: 'Creative' },
        { emoji: '🌄', title: 'Watch the Sunrise', description: 'Cool mornings with clear skies make for breathtaking sunrise views.', tag: 'Outdoor' },
        { emoji: '🧃', title: 'Visit a Food Market', description: 'Comfortable cool weather is great for browsing an outdoor food or craft market.', tag: 'Food' },
      ];
    }
    if (isCold) {
      return [
        { emoji: '🧥', title: 'Brisk Winter Walk', description: `Bundle up for a refreshing walk in the ${temp}°C cold — great for energy and mood.`, tag: 'Outdoor' },
        { emoji: '🍵', title: 'Warm Drinks Indoors', description: 'Wrap up with hot tea, cocoa or coffee and enjoy the cold day from inside.', tag: 'Food' },
        { emoji: '🏛️', title: 'Visit a Museum', description: 'Cold days are perfect for exploring a nearby museum or gallery indoors.', tag: 'Indoor' },
        { emoji: '🧶', title: 'Crafting or Knitting', description: 'Cold weather and indoor crafts go perfectly together — start a creative project.', tag: 'Creative' },
        { emoji: '🍲', title: 'Cook a Hot Stew', description: 'Nothing beats a hearty homemade stew or soup on a cold day like this.', tag: 'Food' },
        { emoji: '🤸', title: 'Indoor Exercise', description: 'Keep warm and active with an indoor workout, gym session or home exercises.', tag: 'Wellness' },
      ];
    }
  }

  if (isCloudy) {
    if (isWindy) {
      return [
        { emoji: '🪁', title: 'Fly a Kite', description: 'Windy and cloudy is perfect kite-flying weather — head to an open field.', tag: 'Outdoor' },
        { emoji: '🧥', title: 'Windbreaker Walk', description: 'Put on a jacket and enjoy a breezy walk — refreshing and energising.', tag: 'Outdoor' },
        { emoji: '📸', title: 'Dramatic Sky Photos', description: 'Cloudy windy skies create moody dramatic clouds perfect for photography.', tag: 'Creative' },
        { emoji: '🎵', title: 'Music and Relaxation', description: 'Stay cosy indoors with a good playlist on a breezy cloudy day.', tag: 'Indoor' },
        { emoji: '📚', title: 'Read or Study', description: 'Overcast windy weather is great background atmosphere for focused reading.', tag: 'Indoor' },
        { emoji: '🍕', title: 'Order Food In', description: 'Too windy to go out? Order your favourite meal and enjoy it at home.', tag: 'Food' },
      ];
    }
    if (isWarm || isHot) {
      return [
        { emoji: '🚶', title: 'Comfortable Outdoor Walk', description: 'Clouds keep the heat manageable — great weather for a long comfortable walk.', tag: 'Outdoor' },
        { emoji: '⚽', title: 'Sports Without Harsh Sun', description: 'Overcast skies mean no harsh sun — perfect for playing outdoor sports.', tag: 'Outdoor' },
        { emoji: '🌿', title: 'Nature Exploration', description: 'Mild cloudy weather is ideal for exploring parks, trails or green spaces.', tag: 'Outdoor' },
        { emoji: '🎨', title: 'Outdoor Sketching', description: 'Soft diffused cloudy light is actually ideal for outdoor art and sketching.', tag: 'Creative' },
        { emoji: '🍽️', title: 'Try a New Restaurant', description: 'Pleasant cloudy weather is great for going out to eat somewhere new.', tag: 'Food' },
        { emoji: '🧘', title: 'Outdoor Yoga', description: 'Cool cloudy conditions make outdoor yoga or stretching very comfortable.', tag: 'Wellness' },
      ];
    }
    return [
      { emoji: '☕', title: 'Cosy Café Morning', description: 'Grey cloudy skies call for a warm drink at your favourite café.', tag: 'Social' },
      { emoji: '📚', title: 'Read or Study', description: 'Overcast days are perfect for focused indoor reading or studying.', tag: 'Indoor' },
      { emoji: '🎬', title: 'Watch a Film', description: 'Cloudy weather is a great excuse to catch up on a movie you have been meaning to watch.', tag: 'Indoor' },
      { emoji: '🧘', title: 'Indoor Wellness', description: 'Use the calm overcast energy for meditation, stretching or a home workout.', tag: 'Wellness' },
      { emoji: '🍳', title: 'Cook a New Recipe', description: 'Try cooking something new today — cloudy days are great for kitchen experiments.', tag: 'Food' },
      { emoji: '🎨', title: 'Creative Project', description: 'Overcast light is soft and even — ideal for painting, drawing or crafting.', tag: 'Creative' },
    ];
  }

  return [
    { emoji: '🚶', title: 'Take a Walk Outside', description: 'Get some fresh air and enjoy the outdoors whatever the weather brings.', tag: 'Outdoor' },
    { emoji: '📚', title: 'Read a Book', description: 'A great time to relax with a good book you have been meaning to start.', tag: 'Indoor' },
    { emoji: '🍽️', title: 'Try a New Recipe', description: 'Experiment in the kitchen and cook something new and delicious today.', tag: 'Food' },
    { emoji: '🤸', title: 'Exercise and Move', description: 'Stay active with a workout session — indoors or outdoors depending on conditions.', tag: 'Wellness' },
    { emoji: '🎨', title: 'Work on a Creative Project', description: 'Spend time on art, music, writing or any creative hobby you enjoy.', tag: 'Creative' },
    { emoji: '👥', title: 'Spend Time with Friends', description: 'Reach out and make plans — good weather or bad, socialising lifts your mood.', tag: 'Social' },
  ];
  }
