import catalog from '@/data/catalog.json';
import durations from '@/data/durations.json';
import type { Channel, Comment, DB, Post, StorySlide, Video } from './types';

const DAY = 86_400_000;
const HOUR = 3_600_000;

interface CatalogItem {
  id: string;
  type: 'video' | 'short';
  channel: string;
  title: string;
  description: string;
  nasaId: string;
  nasaTitle: string;
  nasaDate: string;
  center: string;
  agoDays: number;
  views: number;
  likes: number;
  chapters: [number, string][];
}

const TOPICS: Record<string, string> = {
  loworbit: 'Earth',
  solarcycle: 'The Sun',
  pad39: 'Rockets',
  farlight: 'Telescopes & Mars',
};

function seedChannels(now: number): Record<string, Channel> {
  const c = (ch: Omit<Channel, 'joinedAt'> & { joinedDaysAgo: number }): Channel => {
    const { joinedDaysAgo, ...rest } = ch;
    return { ...rest, joinedAt: now - joinedDaysAgo * DAY };
  };
  return {
    loworbit: c({
      id: 'loworbit', name: 'Low Orbit', handle: '@loworbit', subscribers: 1_240_000, verified: true, topic: TOPICS.loworbit,
      description: 'Earth as seen from about 400 km up. Every clip here is public-domain footage from NASA, cut down to the good part and credited in the description.',
      avatar: '/media/img/av-loworbit.jpg', banner: '/media/img/bn-loworbit.jpg', joinedDaysAgo: 2900,
      links: [{ title: 'NASA Image and Video Library', url: 'https://images.nasa.gov' }],
    }),
    solarcycle: c({
      id: 'solarcycle', name: 'Solar Cycle', handle: '@solarcycle', subscribers: 386_000, verified: true, topic: TOPICS.solarcycle,
      description: 'Flares, sunspots and eruptions from the Solar Dynamics Observatory. New time-lapses when the Sun does something worth watching.',
      avatar: '/media/img/av-solarcycle.jpg', banner: '/media/img/bn-solarcycle.jpg', joinedDaysAgo: 2100,
      links: [{ title: 'SDO mission page', url: 'https://sdo.gsfc.nasa.gov' }],
    }),
    pad39: c({
      id: 'pad39', name: 'Pad 39', handle: '@pad39', subscribers: 2_050_000, verified: true, topic: TOPICS.pad39,
      description: 'Rollouts, static fires and launches. Named after Launch Complex 39 at Kennedy Space Center.',
      avatar: '/media/img/av-pad39.jpg', banner: '/media/img/bn-pad39.jpg', joinedDaysAgo: 3300,
      links: [{ title: 'Artemis program', url: 'https://www.nasa.gov/humans-in-space/artemis/' }],
    }),
    farlight: c({
      id: 'farlight', name: 'Far Light', handle: '@farlight', subscribers: 9_412, verified: false, topic: TOPICS.farlight,
      description: 'Telescopes, rovers and the engineering behind them. Small channel, slow uploads.',
      avatar: '/media/img/av-farlight.jpg', banner: '/media/img/bn-farlight.jpg', joinedDaysAgo: 540,
      links: [],
    }),
    me: c({
      id: 'me', name: 'My Channel', handle: '@mychannel', subscribers: 10_240, verified: false, isMine: true,
      description: '', joinedDaysAgo: 800, links: [],
    }),
  };
}

function chaptersText(chapters: [number, string][]): string {
  if (!chapters.length) return '';
  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  return '\n\n' + chapters.map(([t, title]) => `${fmt(t)} ${title}`).join('\n');
}

function seedVideos(now: number): Video[] {
  const durationOf = durations as Record<string, number>;
  return (catalog as unknown as CatalogItem[]).map((item, i) => ({
    id: item.id,
    channelId: item.channel,
    type: item.type,
    title: item.title,
    description: `${item.description}${chaptersText(item.chapters)}\n\nFootage: ${item.nasaTitle} (NASA ${item.center}, ${item.nasaDate}). Public domain.`,
    duration: durationOf[item.id] ?? 0,
    views: item.views,
    likes: item.likes,
    publishedAt: now - item.agoDays * DAY - (i * 37 % 20) * HOUR,
    src: `/media/v/${item.id}.mp4`,
    thumbnail: `/media/t/${item.id}.jpg`,
    visibility: 'public',
    topic: TOPICS[item.channel],
    credit: { label: 'images.nasa.gov', url: `https://images.nasa.gov/details/${encodeURIComponent(item.nasaId)}` },
  }));
}

// Hand-written viewer comments, tied to what is actually in each clip.
const COMMENTS: [string, string, string, number, number, { creator?: string; pinned?: boolean; hearted?: boolean }?][] = [
  ['helene', '@coastalnina', 'You can see how far the outer bands reach before the eye even shows up. Scary to think people were under that.', 2_140, 30],
  ['helene', '@k.vasquez', 'The arm drifting into frame at the end makes the scale click for me.', 812, 50],
  ['helene', '@loworbit', 'This is about 1:45 of a longer pass. The full recording is linked below.', 390, 46, { creator: 'loworbit', pinned: true }],
  ['idalia', '@stormchaser_dee', 'Watching this from the station is so different from radar. Those cloud tops look solid.', 506, 400],
  ['erin', '@rmacleod', 'Erin got so compact so quickly that week. Good to see it from up here.', 233, 900],
  ['steve', '@auroraharriet', 'I photographed one of these in Alberta in 2019 and had no idea what it was until a forecaster told me.', 1_870, 600],
  ['steve', '@phys_tomas', 'The fact that it turned out to be a different process from the aurora, and kept the name STEVE, is the best part.', 3_410, 1_200],
  ['sdo7', '@ellie.codes', 'Running this on a big screen in our classroom tomorrow. Thank you for not putting music over it.', 702, 60],
  ['sdo7', '@solarcycle', 'Wavelengths change a few times in this one. The gold is 171 Å, the red is 304 Å.', 266, 140, { creator: 'solarcycle', pinned: true }],
  ['transit', '@jdawes', "Two and a half hours of the Moon parked in front of the Sun, and then it immediately flares. Great timing.", 418, 300],
  ['sunspot', '@amateur_hydrogen', 'I was imaging AR2665 from my backyard that week. Nice to see the whole lifecycle.', 1_120, 500],
  ['sunspot', '@lucasb', 'What causes it to fade at the end, rotation or decay?', 84, 700],
  ['sunspot', '@solarcycle', 'Mostly rotation: it goes around the far side. It did weaken a bit before that.', 140, 690, { creator: 'solarcycle' }],
  ['rollout', '@capecanaveral_kim', 'I was at the causeway for this. It took most of the day and it was worth every minute.', 4_200, 20],
  ['rollout', '@m.oduya', 'The sunset shot at the end deserves its own upload.', 2_900, 30, { hearted: true }],
  ['rollout', '@pad39', 'It does now: it is up on the Shorts tab.', 1_100, 26, { creator: 'pad39' }],
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

function seedComments(now: number, videos: Video[]): Comment[] {
  return COMMENTS.filter(([vid]) => videos.some((v) => v.id === vid)).map(([videoId, author, text, likes, ageHours, opts], i) => ({
    id: `c${i}`,
    videoId,
    author,
    text,
    likes,
    createdAt: now - ageHours * HOUR,
    byCreator: !!opts?.creator,
    pinned: opts?.pinned,
    hearted: opts?.hearted,
  }));
}

function seedPosts(now: number): Post[] {
  return [
    { id: 'p1', channelId: 'pad39', text: "Pulled a few extra frames from the Artemis II rollout. Loaded, the crawler tops out at under 1 mph, so the 4.2 miles took most of the day.", image: '/media/img/post-pad39.jpg', createdAt: now - 20 * HOUR, likes: 8_400 },
    { id: 'p2', channelId: 'pad39', text: 'What should the next upload be?', poll: [{ text: 'More SLS booster test angles', votes: 6_120 }, { text: 'Crew access arm close-ups', votes: 2_480 }, { text: 'Night launch compilation', votes: 9_030 }], createdAt: now - 3 * DAY, likes: 2_100 },
    { id: 'p3', channelId: 'solarcycle', text: 'AR 2665 at its largest, around July 10, 2017. The full two-week time-lapse is on the channel.', image: '/media/img/post-solarcycle.jpg', createdAt: now - 2 * DAY, likes: 1_920, videoId: 'sunspot' },
    { id: 'p4', channelId: 'loworbit', text: "A still from the Hurricane Erin pass. The station was about 420 km above the storm when this was taken.", image: '/media/img/post-loworbit.jpg', createdAt: now - 5 * DAY, likes: 3_300 },
    { id: 'p5', channelId: 'farlight', text: 'Uploads are slower this month while I sort through the Perseverance landing footage. Thanks for sticking around.', createdAt: now - 8 * DAY, likes: 141 },
  ];
}

function seedStories(now: number): StorySlide[] {
  return [
    { id: 'st1', channelId: 'pad39', createdAt: now - 5 * HOUR, image: '/media/img/st-pad39-1.jpg', background: '#000', text: 'Sunset at 39B', textColor: '#ffffff', videoId: 'rollout' },
    { id: 'st2', channelId: 'pad39', createdAt: now - 2 * HOUR, image: '/media/img/st-pad39-2.jpg', background: '#000', text: 'Booster test angle #2 coming this week', textColor: '#ffffff' },
    { id: 'st3', channelId: 'loworbit', createdAt: now - 26 * HOUR, image: '/media/img/st-loworbit-1.jpg', background: '#000', text: 'Helene, Sept 26', textColor: '#ffffff', videoId: 'helene' },
    { id: 'st4', channelId: 'solarcycle', createdAt: now - 3 * DAY, image: '/media/img/st-solarcycle-1.jpg', background: '#000', text: 'Quiet week on the Sun. Re-watching 2017.', textColor: '#ffffff', videoId: 'sunspot' },
  ];
}

export const DB_VERSION = 4;

export function buildSeed(now = Date.now()): DB {
  const videos = seedVideos(now);
  return {
    version: DB_VERSION,
    createdAt: now,
    channels: seedChannels(now),
    videos,
    comments: seedComments(now, videos),
    posts: seedPosts(now),
    postComments: [],
    stories: seedStories(now),
    playlists: [],
    user: {
      subscriptions: ['loworbit', 'pad39', 'solarcycle'],
      bells: { pad39: 'all', loworbit: 'personalized', solarcycle: 'personalized' },
      liked: [], disliked: [], watchLater: [], history: [], historyPaused: false,
      searchHistory: [], votes: {}, likedComments: [], dislikedComments: [], likedPosts: [], likedStories: [], seenStories: [],
      progress: {}, theme: 'dark', autoplay: true, downloads: [], hiddenVideos: [], hiddenChannels: [],
      readNotifications: [], dismissedNotifications: [], viewLog: [],
    },
  };
}
