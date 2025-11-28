const STORAGE_KEY = "imposter_categories_v2";

const DEFAULT_CATEGORIES_RAW = [
    {
        "Food": [
            "Pizza", "Burger", "Sushi", "Pasta", "Ice Cream", "Steak", "Salad", "Taco",
            "Sandwich", "Fries", "Noodles", "Curry", "Soup", "Bagel", "Donut", "Cake",
            "Cookie", "Hot Dog", "Pancakes", "Waffles", "Chocolate", "Popcorn",
            "Chicken Wings", "Burrito", "Lasagna", "Ramen", "Fried Rice", "Cheese",
            "Apple", "Banana", "Orange", "Grapes", "Strawberries", "Watermelon",
            "Pineapple", "Mango", "Avocado", "Broccoli", "Carrots", "Potatoes",
            "Corn", "Peas", "Rice", "Sausage", "Fish", "Shrimp", "Beef", "Pork",
            "Turkey", "Eggs", "Toast", "Butter", "Yogurt", "Cereal", "Milk", "Juice",
            "Smoothie", "Tea", "Coffee", "Cupcake", "Muffin", "Chips",
            "Pretzels", "Tortilla", "Quesadilla", "Meatballs", "Lobster", "Crab",
            "Dim Sum", "Sashimi", "Falafel", "Hummus", "Kebab", "Pho",
            "Baguette", "Scone", "Pudding", "Brownie", "Nachos", "Guacamole",
            "Salsa", "Popsicle", "Tiramisu", "Brown Rice", "Chili", "Omelette",
            "Shrimp Cocktail", "Tuna Roll", "Pad Thai", "Cottage Pie",
            "Mac & Cheese", "Bruschetta", "Garlic Bread", "Calamari"
        ]
    },
    {
        "Animals": [
            "Dog", "Cat", "Horse", "Cow", "Pig", "Sheep", "Goat", "Chicken",
            "Duck", "Turkey", "Rabbit", "Hamster", "Guinea Pig", "Fish",
            "Shark", "Whale", "Dolphin", "Seal", "Penguin", "Tiger", "Lion",
            "Bear", "Fox", "Wolf", "Elephant", "Giraffe", "Zebra", "Kangaroo",
            "Koala", "Panda", "Monkey", "Gorilla", "Chimpanzee", "Snake",
            "Lizard", "Frog", "Toad", "Turtle", "Eagle", "Hawk", "Falcon",
            "Owl", "Parrot", "Swan", "Flamingo", "Peacock", "Ostrich",
            "Crocodile", "Alligator", "Bison", "Buffalo", "Hippopotamus",
            "Rhinoceros", "Cheetah", "Leopard", "Meerkat", "Otter",
            "Hedgehog", "Squirrel", "Mouse", "Rat", "Ant", "Bee", "Wasp",
            "Butterfly", "Moth", "Spider", "Scorpion", "Octopus", "Crab",
            "Lobster", "Starfish", "Jellyfish", "Seahorse", "Goldfish",
            "Salmon", "Trout", "Camel", "Donkey", "Moose", "Deer", "Elk",
            "Boar", "Raccoon", "Skunk", "Badger", "Bat", "Polar Bear",
            "Hyena", "Gazelle", "Iguana", "Chameleon", "Tortoise",
            "Shrew", "Mole", "Slug", "Snail"
        ]
    },
    {
        "Places": [
            "School", "Hospital", "Airport", "Train Station", "Hotel", "Restaurant",
            "Café", "Library", "Museum", "Zoo", "Aquarium", "Park", "Playground",
            "Beach", "Mountain", "Forest", "City Center", "Office", "Factory",
            "Farm", "Supermarket", "Mall", "Cinema", "Theater", "Stadium",
            "Swimming Pool", "Gym", "Bakery", "Bar", "Nightclub", "Bus Stop",
            "Post Office", "Bank", "Police Station", "Fire Station", "Garage",
            "Bridge", "Tunnel", "Highway", "Road", "House", "Apartment",
            "Bathroom", "Bedroom", "Kitchen", "Living Room", "Garden", "Basement",
            "Attic", "Balcony", "Roof", "River", "Lake", "Desert", "Island",
            "Jungle", "Volcano", "Train", "Subway", "Classroom",
            "Doctor's Office", "Dentist", "Courtroom", "Church", "Temple", "Castle",
            "Tower", "Harbor", "Space Station", "Moon", "Theme Park", "Race Track",
            "Boardwalk", "Campground", "Waterfall", "Ice Rink", "Ski Resort",
            "Bus", "Taxi", "Picnic Area", "Locker Room", "Arcade", "Docks",
            "Greenhouse", "Barn", "Cottage"
        ]
    },
    {
        "Jobs": [
            "Teacher", "Doctor", "Nurse", "Chef", "Waiter", "Mechanic", "Engineer",
            "Architect", "Scientist", "Pilot", "Farmer", "Police Officer", "Firefighter",
            "Dentist", "Vet", "Artist", "Musician", "Actor", "Writer", "Librarian",
            "Cashier", "Driver", "Builder", "Plumber", "Electrician", "Baker",
            "Butcher", "Barber", "Hairdresser", "Journalist", "Photographer",
            "Soldier", "Detective", "Judge", "Lawyer", "Banker", "Programmer",
            "Designer", "Tailor", "Dancer", "Athlete", "Coach", "Referee",
            "Zookeeper", "Astronaut", "Taxi Driver", "Delivery Driver",
            "Pilot", "Flight Attendant", "Tour Guide", "Receptionist",
            "Janitor", "Gardener", "Social Worker", "Pharmacist", "Cashier"
        ]
    },
    {
        "Objects": [
            "Phone", "Laptop", "TV", "Remote", "Keyboard", "Mouse", "Headphones",
            "Microphone", "Camera", "Watch", "Wallet", "Keys", "Pen", "Pencil",
            "Notebook", "Book", "Bag", "Backpack", "Sunglasses", "Glasses",
            "Bottle", "Cup", "Mug", "Plate", "Bowl", "Fork", "Spoon", "Knife",
            "Chair", "Table", "Sofa", "Bed", "Pillow", "Blanket", "Lamp",
            "Mirror", "Toothbrush", "Hairbrush", "Comb", "Towel", "Soap",
            "Shampoo", "Razor", "Scissors", "Stapler", "Paperclip", "Charger",
            "Battery", "Clock", "Calendar", "Fan", "Heater", "Oven", "Fridge",
            "Washing Machine", "Vacuum", "Broom", "Dustpan", "Bucket", "Rope",
            "Tape", "Glue", "Marker", "Crayons", "Ball", "Toy", "Puzzle",
            "Board Game", "Card", "Umbrella", "Raincoat", "Helmet", "Bicycle",
            "Skateboard", "Scooter", "Car", "Bike", "Bus", "Train Ticket",
            "Map", "Suitcase", "Shoes", "Socks", "Jacket", "Hat", "Scarf",
            "Gloves", "Drill", "Hammer", "Wrench", "Screwdriver", "Nail",
            "Paintbrush", "Canvas", "String Lights", "Gift Box"
        ]
    },
    {
        "Movies/TV": [
            "Star Wars", "Harry Potter", "Lord of the Rings", "Frozen",
            "Toy Story", "Jurassic Park", "The Avengers",
            "Spider-Man", "Batman", "Superman", "Iron Man", "Black Panther",
            "The Lion King", "Shrek", "Finding Nemo", "The Incredibles",
            "Stranger Things", "SpongeBob SquarePants", "The Simpsons",
            "Friends", "Game of Thrones", "Sherlock", "The Office",
            "Avatar", "Pirates of the Caribbean", "Indiana Jones",
            "James Bond", "Top Gun", "Minions", "Despicable Me",
            "Monsters Inc", "Moana", "Tangled", "Cinderella", "Aladdin",
            "Beauty and the Beast", "Cars", "Coco", "Zootopia",
            "WALL·E", "Up", "The Matrix", "Breaking Bad", "Mandalorian",
            "Star Trek", "Doctor Who", "Pokémon", "Naruto", "One Piece",
            "Winnie the Pooh", "Peppa Pig", "Barbie", "Scooby-Doo",
            "Toy Story 3", "Madagascar", "Kung Fu Panda", "Twilight",
            "Hunger Games", "Wizards of Waverly Place"
        ]
    },
    {
        "Hobbies": [
            "Running", "Swimming", "Cycling", "Hiking", "Camping", "Fishing",
            "Dancing", "Singing", "Playing Guitar", "Playing Piano", "Drawing",
            "Painting", "Cooking", "Baking", "Reading", "Writing", "Photography",
            "Videogames", "Board Games", "Card Games", "Bowling", "Tennis",
            "Soccer", "Basketball", "Football", "Baseball", "Skateboarding",
            "Surfing", "Skiing", "Snowboarding", "Yoga", "Meditation",
            "Gardening", "Birdwatching", "Chess", "Karaoke", "Shopping",
            "Collecting Cards", "Playing with Pets", "Magic Tricks",
            "Origami", "Scrapbooking", "Bike Riding", "Weightlifting",
            "Rock Climbing", "Kayaking", "Sailing", "Archery", "Martial Arts",
            "Acting", "Cooking", "Stand-up Comedy", "Podcasts", "Blogging",
            "Journaling", "Stargazing", "Watching Movies", "Watching TV",
            "Concerts", "Travelling", "DIY Crafts", "Puzzles"
        ]
    },
];

// Turn whatever we have (old or new format) into [{ id, name, words }]
function normalizeCategories(source) {
  if (!Array.isArray(source)) return [];

  // If it already looks like [{ id, name, words }], just keep it
  if (source[0] && source[0].id && source[0].name && Array.isArray(source[0].words)) {
    return source;
  }

  // Old format: [{ "Food": [ ... ] }, { "Animals": [ ... ] }, ...]
  return source.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const [name, words] = Object.entries(entry)[0] || [];
    if (!name || !Array.isArray(words)) return [];

    return [
      {
        id: name.toLowerCase().replace(/\s+/g, "-") + "-" + (index + 1),
        name,
        words,
      },
    ];
  });
}

/**
 * @returns {Array<{id: string, name: string, words: string[]}>}
 */
export function loadCategories() {
  const defaults = normalizeCategories(DEFAULT_CATEGORIES_RAW);

  if (typeof localStorage === "undefined") {
    return defaults;
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return defaults;

  try {
    const parsed = JSON.parse(stored);
    const normal = normalizeCategories(parsed);
    return normal.length ? normal : defaults;
  } catch {
    return defaults;
  }
}

/**
 * @param {Array<{id: string, name: string, words: string[]}>} categories
 */
export function saveCategories(categories) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
}
