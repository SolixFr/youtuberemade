import type Database from 'better-sqlite3';
import catalog from '@/data/catalog.json';
import durations from '@/data/durations.json';

/* Demo catalogue: public-domain NASA footage posted by four fictional channels.
   Seed channels have no password, so nobody can sign in as them. */

const DAY = 86_400_000;
const HOUR = 3_600_000;

interface CatalogItem {
  id: string; type: 'video' | 'short'; channel: string; title: string; description: string;
  nasaId: string; nasaTitle: string; nasaDate: string; center: string;
  agoDays: number; views: number; likes: number; chapters: [number, string][];
}

const TOPICS: Record<string, string> = { loworbit: 'Earth', solarcycle: 'The Sun', pad39: 'Rockets', farlight: 'Telescopes & Mars' };

const CHANNELS = [
  { id: 'loworbit', name: 'Low Orbit', subs: 1_240_000, verified: 1, joined: 2900,
    desc: 'Earth as seen from about 400 km up. Every clip here is public-domain footage from NASA, cut down to the good part and credited in the description.',
    links: [{ title: 'NASA Image and Video Library', url: 'https://images.nasa.gov' }] },
  { id: 'solarcycle', name: 'Solar Cycle', subs: 386_000, verified: 1, joined: 2100,
    desc: 'Flares, sunspots and eruptions from the Solar Dynamics Observatory. New time-lapses when the Sun does something worth watching.',
    links: [{ title: 'SDO mission page', url: 'https://sdo.gsfc.nasa.gov' }] },
  { id: 'pad39', name: 'Pad 39', subs: 2_050_000, verified: 1, joined: 3300,
    desc: 'Rollouts, static fires and launches. Named after Launch Complex 39 at Kennedy Space Center.',
    links: [{ title: 'Artemis program', url: 'https://www.nasa.gov/humans-in-space/artemis/' }] },
  { id: 'farlight', name: 'Far Light', subs: 9_412, verified: 0, joined: 540,
    desc: 'Telescopes, rovers and the engineering behind them. Small channel, slow uploads.', links: [] },
];

// Viewer comments, written about what is actually in each clip.
const COMMENTS: [string, string, string, number, number, ('creator' | 'pinned' | 'hearted')[]?][] = [
  ['helene', '@coastalnina', 'You can see how far the outer bands reach before the eye even shows up. Scary to think people were under that.', 2_140, 30],
  ['helene', '@k.vasquez', 'The arm drifting into frame at the end makes the scale click for me.', 812, 50],
  ['helene', '@loworbit', 'This is about 1:45 of a longer pass. The full recording is linked below.', 390, 46, ['creator', 'pinned']],
  ['idalia', '@stormchaser_dee', 'Watching this from the station is so different from radar. Those cloud tops look solid.', 506, 400],
  ['erin', '@rmacleod', 'Erin got so compact so quickly that week. Good to see it from up here.', 233, 900],
  ['steve', '@auroraharriet', 'I photographed one of these in Alberta in 2019 and had no idea what it was until a forecaster told me.', 1_870, 600],
  ['steve', '@phys_tomas', 'The fact that it turned out to be a different process from the aurora, and kept the name STEVE, is the best part.', 3_410, 1_200],
  ['sdo7', '@ellie.codes', 'Running this on a big screen in our classroom tomorrow. Thank you for not putting music over it.', 702, 60],
  ['sdo7', '@solarcycle', 'Wavelengths change a few times in this one. The gold is 171 Å, the red is 304 Å.', 266, 140, ['creator', 'pinned']],
  ['transit', '@jdawes', 'Two and a half hours of the Moon parked in front of the Sun, and then it immediately flares. Great timing.', 418, 300],
  ['sunspot', '@amateur_hydrogen', 'I was imaging AR2665 from my backyard that week. Nice to see the whole lifecycle.', 1_120, 500],
  ['sunspot', '@lucasb', 'What causes it to fade at the end, rotation or decay?', 84, 700],
  ['rollout', '@capecanaveral_kim', 'I was at the causeway for this. It took most of the day and it was worth every minute.', 4_200, 20],
  ['rollout', '@m.oduya', 'The sunset shot at the end deserves its own upload.', 2_900, 30, ['hearted']],
  ['booster', '@propulsion_pri', 'That nozzle movement around the minute mark is the gimbal test. People always think it is shaking loose.', 1_760, 300],
  ['booster', '@nate_from_utah', 'You could hear this one from Brigham City.', 640, 500],
  ['ascent', '@hlin', 'The booster tumbling away with the Earth behind it is unreal.', 6_300, 100],
  ['ascent', '@viktor.s', 'I forget how fast it is already going at separation.', 2_210, 140],
  ['prefire', '@nz_lauren', 'Māhia launches at night are something else.', 182, 1_500],
  ['landing', '@rover_dad', 'The heat shield falling away still gives me chills.', 2_000, 200],
  ['landing', '@geo.amara', "You can see the delta deposits right before the sky crane takes over. That's why they picked Jezero.", 1_330, 250],
  ['webbshake', '@mecheng_sam', 'People asked why it took so long. This is why: test, fix, test again.', 401, 1_000],
  ['hubble29', '@nebula.notes', 'Southern Crab looks like an hourglass. Hubble still has it after 29 years.', 233, 3_000],
  ['s-ascent', '@quinnn', 'replayed this like 10 times', 3_800, 200],
  ['s-booster', '@ash.k', 'imagine standing a mile away from this', 1_200, 80],
  ['s-eye', '@tropics_watch', 'The eye wall is so clean here.', 600, 60],
];

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

export function seed(db: Database.Database) {
  const now = Date.now();
  const addUser = db.prepare(`INSERT INTO users (id, handle, name, description, avatar, banner, verified, subscribers, links, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const c of CHANNELS) {
    addUser.run(c.id, `@${c.id}`, c.name, c.desc, `/media/img/av-${c.id}.jpg`, `/media/img/bn-${c.id}.jpg`, c.verified, c.subs, JSON.stringify(c.links), now - c.joined * DAY);
  }

  const addVideo = db.prepare(`INSERT INTO videos (id, channel_id, type, title, description, duration, views, likes, published_at, src, thumbnail, visibility, topic, credit_label, credit_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', ?, ?, ?)`);
  const durationOf = durations as Record<string, number>;
  (catalog as unknown as CatalogItem[]).forEach((item, i) => {
    const chapters = item.chapters.length ? `\n\n${item.chapters.map(([t, title]) => `${fmt(t)} ${title}`).join('\n')}` : '';
    const description = `${item.description}${chapters}\n\nFootage: ${item.nasaTitle} (NASA ${item.center}, ${item.nasaDate}). Public domain.`;
    addVideo.run(item.id, item.channel, item.type, item.title, description, durationOf[item.id] ?? 0, item.views, item.likes,
      now - item.agoDays * DAY - ((i * 37) % 20) * HOUR, `/media/v/${item.id}.mp4`, `/media/t/${item.id}.jpg`, TOPICS[item.channel],
      'images.nasa.gov', `https://images.nasa.gov/details/${encodeURIComponent(item.nasaId)}`);
  });

  const addComment = db.prepare(`INSERT INTO comments (id, video_id, author_id, author_name, text, likes, pinned, hearted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  COMMENTS.forEach(([videoId, author, text, likes, ageHours, flags = []], i) => {
    const creator = flags.includes('creator') ? author.slice(1) : null;
    addComment.run(`c${i}`, videoId, creator, creator ? null : author, text, likes, flags.includes('pinned') ? 1 : 0, flags.includes('hearted') ? 1 : 0, now - ageHours * HOUR);
  });

  const addPost = db.prepare('INSERT INTO posts (id, channel_id, text, image, video_id, likes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  addPost.run('p1', 'pad39', 'Pulled a few extra frames from the Artemis II rollout. Loaded, the crawler tops out at under 1 mph, so the 4.2 miles took most of the day.', '/media/img/post-pad39.jpg', null, 8_400, now - 20 * HOUR);
  addPost.run('p2', 'pad39', 'What should the next upload be?', null, null, 2_100, now - 3 * DAY);
  addPost.run('p3', 'solarcycle', 'AR 2665 at its largest, around July 10, 2017. The full two-week time-lapse is on the channel.', '/media/img/post-solarcycle.jpg', 'sunspot', 1_920, now - 2 * DAY);
  addPost.run('p4', 'loworbit', 'A still from the Hurricane Erin pass. The station was about 420 km above the storm when this was taken.', '/media/img/post-loworbit.jpg', null, 3_300, now - 5 * DAY);
  addPost.run('p5', 'farlight', 'Uploads are slower this month while I sort through the Perseverance landing footage. Thanks for sticking around.', null, null, 141, now - 8 * DAY);
  const addOption = db.prepare('INSERT INTO poll_options (post_id, idx, text, votes) VALUES (?, ?, ?, ?)');
  addOption.run('p2', 0, 'More SLS booster test angles', 6_120);
  addOption.run('p2', 1, 'Crew access arm close-ups', 2_480);
  addOption.run('p2', 2, 'Night launch compilation', 9_030);

  const addStory = db.prepare("INSERT INTO stories (id, channel_id, image, background, text, text_color, video_id, created_at) VALUES (?, ?, ?, '#000', ?, '#ffffff', ?, ?)");
  addStory.run('st1', 'pad39', '/media/img/st-pad39-1.jpg', 'Sunset at 39B', 'rollout', now - 5 * HOUR);
  addStory.run('st2', 'pad39', '/media/img/st-pad39-2.jpg', 'Booster test angle #2 coming this week', null, now - 2 * HOUR);
  addStory.run('st3', 'loworbit', '/media/img/st-loworbit-1.jpg', 'Helene, Sept 26', 'helene', now - 26 * HOUR);
  addStory.run('st4', 'solarcycle', '/media/img/st-solarcycle-1.jpg', 'Quiet week on the Sun. Re-watching 2017.', 'sunspot', now - 3 * DAY);
}
