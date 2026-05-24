export const THEMES = [
  "Blood Moon",
  "Coven",
  "Dark Star",
  "Dawnbringer",
  "Nightbringer",
  "Dragonmancer",
  "Elderwood",
  "Empyrean",
  "High Noon",
  "Inkshadow",
  "Mecha Kingdoms",
  "Odyssey",
  "Omega Squad",
  "Pool Party",
  "PROJECT",
  "PsyOps",
  "Pulsefire",
  "Ruined",
  "Sentinel",
  "Soul Fighter",
  "Spirit Blossom",
  "Star Guardian",
  "Winterblessed",
  "Arcade",
  "Battle Academia",
  "Cafe Cuties",
  "Space Groove",
];

export type ThemeReference = {
  // Curated 1–2 sentence visual style guide: palette, materials,
  // signature VFX, silhouette cues, mood. Injected verbatim into the
  // refine prompt so the model gets a concrete styling anchor. The
  // matching skin-line splash arts are scanned live from DDragon's
  // championFull.json at cron-time — see getThemeSkinSplashes() in
  // app/api/cron/generate/route.ts.
  blurb: string;
};

export const THEME_REFERENCES: Record<string, ThemeReference> = {
  "Blood Moon": {
    blurb:
      "Demon-cult Ionian aesthetic with deep blacks, lacquer reds, and a swollen crimson moon; champions wear porcelain oni/kabuki masks, ragged silk robes, and obi sashes; signature VFX are crimson talismans, ink-brush smoke, and blood-petal sparks; mood is ritualistic, frenzied, and predatory.",
  },
  Coven: {
    blurb:
      "Dark fantasy witch-cult palette of deep crimson, violet, gold, and black with elaborate baroque gowns, antlers, candle wax, raven feathers, and ritual jewelry; signature VFX are flickering violet candleflame, blood magic sigils, and writhing tendrils of Old-God shadow; mood is gothic, occult, and regally menacing.",
  },
  "Dark Star": {
    blurb:
      "Cosmic-horror palette of pitch black, void violet, and searing magenta/cyan event-horizon light; sleek alien armor of obsidian shards and gravitational rings, with constellations and singularities for skin; signature VFX are swirling galaxies, spaghettifying matter streams, and explosive supernova bursts; mood is godlike, devouring, and apocalyptic.",
  },
  Dawnbringer: {
    blurb:
      "Radiant divine-order palette of gold, ivory, sky blue, and sunrise pink; flowing white-and-gold raiment, feathered wings, halos, sun-disc motifs, and luminous solar weaponry; signature VFX are warm golden light shafts, glowing feathers, and dawn-flare sparkles; mood is hopeful, sacred, and heroic.",
  },
  Nightbringer: {
    blurb:
      "Cosmic-chaos palette of obsidian black, blood crimson, and burning indigo/purple flame; jagged demonic armor, horned helms, tattered cloaks, and corruption tendrils crawling like ink; signature VFX are violet hellfire, glowing red runes, and shadow smoke; mood is wrathful, fallen, and apocalyptic.",
  },
  Dragonmancer: {
    blurb:
      "East-Asian wuxia palette of jade green, lacquer red, imperial gold, and ink black; champions wear scaled dragon armor and silken robes wrapped in serpentine spirit-dragons; signature VFX are coiling elemental dragons made of flame, water, lightning, and storm clouds, with calligraphic energy strokes; mood is mystical, regal, and martial.",
  },
  Elderwood: {
    blurb:
      "Ancient enchanted forest palette of moss green, bark brown, twilight teal, amber, and bioluminescent gold; champions are druidic forest spirits with antlers, vine-wrapped armor, wooden masks, glowing carved runes, and leaf-and-moth motifs; signature VFX are firefly sparks, golden rune-glyphs, and drifting petals; mood is hushed, fey, primeval and serene.",
  },
  Empyrean: {
    blurb:
      "Graffiti-meets-godhood palette of electric magenta, acid cyan, neon yellow, and matte black with chrome-liquid skin; streetwear silhouettes (hoodies, baggy pants, sneakers) fused with floating reality-shattering glyphs and dripping paint; signature VFX are aerosol-spray smoke, glitching neon sigils, and splattered chromatic paint; mood is rebellious, divine, and stylishly destructive.",
  },
  "High Noon": {
    blurb:
      "Hellfire spaghetti-western palette of dusty ochre, burnt orange, brimstone red, charcoal, and pale bone with sunset gold rim-light; cowboy hats, long dusters, leather chaps, bandoliers, and demonic six-shooters; signature VFX are jets of orange hellfire, ember sparks, smoking brimstone, and brass shell casings; mood is gritty, supernatural, and stoic-vengeful.",
  },
  Inkshadow: {
    blurb:
      "Sumi-e ink-warrior palette of bone white, deep black ink, vermillion red seal, and gold leaf accents; champions wear minimalist hakama, hooded robes, and bare skin marked with living calligraphy tattoos that animate into beasts and weapons; signature VFX are sweeping brush-stroke slashes, splattering ink droplets, and emerging painted spirit-creatures; mood is stoic, mystical, and lethally elegant.",
  },
  "Mecha Kingdoms": {
    blurb:
      "Mecha-samurai palette of lacquer red, imperial gold, jade green, royal blue, and gunmetal with silk-banner accents; pilots in ornate kingdom regalia atop towering bipedal mechs styled like feudal warlords with kabuto-horned heads and katana-like weapons; signature VFX are jet thrusters, sparking servos, fluttering banners, and kaiju-fight debris; mood is epic, heroic, and Lunar-New-Year grand.",
  },
  Odyssey: {
    blurb:
      "Pulpy 80s sci-fi space-pirate palette of teal, magenta, sunset orange, and starfield purple; ragtag crew in flight suits, jetpacks, alien hide armor, mismatched goggles, and customized plasma weapons; signature VFX are laser bolts, neon shield projections, holographic HUDs, and warp-streak stars; mood is adventurous, irreverent, and cinematic.",
  },
  "Omega Squad": {
    blurb:
      "Gritty Vietnam-war commando palette of jungle olive, mud brown, blackened steel, and battle-scorched khaki; champions wear flak vests, dog tags, bandanas, face paint, and carry oversized rifles, knives, and grenades; signature VFX are tracer fire, smoke grenades, napalm orange fire, and exploding debris; mood is bleak, hardened, and war-torn.",
  },
  "Pool Party": {
    blurb:
      "Sunny tropical resort palette of cyan pool water, hot pink, lemon yellow, coconut white, and tanned skin; swimsuits, board shorts, floaties, sunglasses, beach towels, and inflatable weapons (squirt guns, beach balls); signature VFX are splashing water arcs, foam bubbles, cocktail umbrellas, and lens-flare sun sparkles; mood is playful, carefree, and summer-blockbuster fun.",
  },
  PROJECT: {
    blurb:
      "Cyberpunk corpo-augment palette of matte black, brushed steel, hazard yellow, and hot cyan/red HUD highlights; sleek paneled armor with exposed cables, visored helmets, augmented limbs, and emissive trim lines; signature VFX are holographic interface glitches, neon energy blades, data-stream particles, and scanning-laser sweeps; mood is sterile, dystopian, and clinically lethal.",
  },
  PsyOps: {
    blurb:
      "Black-ops espionage palette of midnight navy, tactical black, asphalt gray, and pulsing magenta-violet psychic energy; modern military fatigues, balaclavas, vests, drones, and combat boots; signature VFX are levitating debris, telekinetic shockwaves, glowing violet mind-tendrils, and HUD reticles; mood is covert, paranoid, and psychically charged.",
  },
  Pulsefire: {
    blurb:
      "Time-traveler chrono-tech palette of clean white plating, glowing electric blue/cyan circuitry, and orange-amber chrono accents; sleek futuristic armor with floating gauntlet-modules, visors, and hovering core devices; signature VFX are blue energy contrails, clock-gear runes, holographic timelines, and pulsing plasma blasts; mood is heroic, polished, and high-tech.",
  },
  Ruined: {
    blurb:
      "Black Mist undead palette of sickly mint-green spectral fire, rotted bronze, tarnished gold, deep teal, and bone white over rust-black armor; corroded regal armor, tattered royal cloaks, broken crowns, and skeletal weaponry leaking mist; signature VFX are green soul-flame, wailing wraith-tendrils, and floating skull motes; mood is mournful, cursed, and imperial-decayed.",
  },
  Sentinel: {
    blurb:
      "Sacred holy-warrior palette of polished gold, ivory, sun-amber, with deep teal and white-flame accents; ornate inlaid plate armor, flowing tabards, sun-disc shields, and relic weapons radiating warm light; signature VFX are golden flame purification, glowing engraved runes, and feathered light particles; mood is righteous, dawn-bright, and undying-vigilant.",
  },
  "Soul Fighter": {
    blurb:
      "Anime tournament-fighter palette of vivid cyan, hot magenta, electric yellow, and sunset orange against a stadium-arena background; martial-artist outfits — gi, fingerless gloves, bandages, headbands, dramatic capes, and signature weapons; signature VFX are bursting chi auras, energy fireballs, after-image speed lines, and shockwave punches; mood is high-energy, flashy, and shonen-tournament epic.",
  },
  "Spirit Blossom": {
    blurb:
      "Japanese folklore yokai-festival palette of cherry-blossom pink, lantern red-orange, twilight indigo, jade, and gold leaf; flowing kimono and yukata, fox-spirit ears and tails, masks, paper lanterns, and origami fans; signature VFX are drifting sakura petals, glowing spirit wisps, golden seal-talismans, and silk ribbons; mood is dreamlike, melancholic, and serenely magical.",
  },
  "Star Guardian": {
    blurb:
      "Magical-girl cosmic palette of pastel pink, cyan, lavender, white, and starlight gold with iridescent rainbow highlights; school-uniform-meets-armor outfits with thigh-high boots, ribbons, frilled skirts, ornate gauntlets, and crystalline summoned weapons; signature VFX are sparkling stars, ribbon trails, heart and crescent sigils, and burst nebula auras; mood is hopeful, dramatic, and bittersweet.",
  },
  Winterblessed: {
    blurb:
      "Frost-festival palette of icy aqua-blue, snow white, silver, deep navy, and warm holiday gold/cranberry accents; cozy-yet-regal fur-trimmed coats, scarves, fur hoods, ornate winter-court armor, and crystalline ice weapons; signature VFX are swirling snowflakes, blue-white frost mist, glowing aurora ribbons, and shattering ice shards; mood is enchanted, hushed, and yuletide-magical.",
  },
  Arcade: {
    blurb:
      "Retro 8/16-bit arcade palette of hot pink, electric blue, neon green, yellow, and CRT-scanline black; pixel-block weapons, cartoony exaggerated armor, sprite-style accessories, and floating power-up icons; signature VFX are pixel-cube explosions, glitch artifacts, score popups, and rainbow light beams; mood is gleeful, kitschy, and high-score competitive.",
  },
  "Battle Academia": {
    blurb:
      "Anime shonen-school palette of crisp white, navy blue, crimson red, and gold trim with cherry-blossom pink accents; tailored school blazers, plaid skirts, ties, and academy-crested capes that transform into magical battle gear with oversized signature weapons; signature VFX are bursting elemental auras, glowing crest sigils, falling petals, and dramatic speed lines; mood is youthful, heroic, and tournament-arc dramatic.",
  },
  "Cafe Cuties": {
    blurb:
      "Pastel cosplay-cafe palette of strawberry pink, mint, cream, butter yellow, and chocolate brown with rainbow sprinkles; frilly maid-and-barista outfits with aprons, oversized bows, animal ears, and dessert-shaped weapons (whisks, ice-cream cones, latte trays); signature VFX are whipped-cream swirls, floating hearts, sugar sparkles, and steam from coffee cups; mood is sweet, wholesome, and cutesy-charming.",
  },
  "Space Groove": {
    blurb:
      "70s funk disco-cosmos palette of hot magenta, lime, tangerine, lavender, and chrome silver under groovy starfield purples; bell-bottom jumpsuits, platform boots, afros, fur collars, glittery sunglasses, and ray-gun weapons; signature VFX are rotating disco-ball sparkles, lava-lamp blob effects, neon equalizer waves, and rainbow funk-light beams; mood is funky, joyful, and trippy-retro.",
  },
};
