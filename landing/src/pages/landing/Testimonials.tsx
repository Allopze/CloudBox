import { Twitter } from 'lucide-react';

const TWEETS = [
  {
    id: 1,
    name: 'Alex Chen',
    handle: '@alxchn',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
    content: 'CloudBox has completely transformed how I manage my personal cloud. The speed is incredible and the UI is just beautiful. 🚀',
    date: '2 days ago',
    likes: 124,
  },
  {
    id: 2,
    name: 'Sarah Miller',
    handle: '@sarahm_dev',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
    content: 'Finally a self-hosted solution that doesn\'t look like it was built in 2010. The setup was a breeze! #selfhosted #cloudbox',
    date: '1 week ago',
    likes: 89,
  },
  {
    id: 3,
    name: 'David Park',
    handle: '@dpark_design',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David',
    content: 'The attention to detail in CloudBox is unmatched. Dark mode is perfect. 🌙',
    date: '3 days ago',
    likes: 256,
  },
  {
    id: 4,
    name: 'Emma Wilson',
    handle: '@emma_w',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emma',
    content: 'Moved all my photos to CloudBox. The thumbnail generation is blazing fast. Highly recommend!',
    date: 'Yesterday',
    likes: 42,
  },
  {
    id: 5,
    name: 'James Rodriguez',
    handle: '@jrod_tech',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=James',
    content: 'Just deployed CloudBox on my home server. Docker compose up and done. Amazing work team!',
    date: '5 hours ago',
    likes: 15,
  },
  {
    id: 6,
    name: 'Lisa Wang',
    handle: '@lisaw_ux',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Lisa',
    content: 'The sharing features are exactly what I needed for my freelance work. Clients love the download pages.',
    date: '2 weeks ago',
    likes: 67,
  },
];

export default function Testimonials() {
  return (
    <section className="py-24 sm:py-32 relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-dark-900 dark:text-white sm:text-4xl">
            Loved by the community
          </h2>
          <p className="mt-4 text-lg leading-8 text-dark-600 dark:text-dark-300">
            Join thousands of users who trust CloudBox for their data.
          </p>
        </div>
        <div className="mx-auto mt-16 flow-root max-w-2xl sm:mt-20 lg:mx-0 lg:max-w-none">
          <div className="-mt-8 sm:-mx-4 sm:columns-2 lg:columns-3">
            {TWEETS.map((tweet) => (
              <div key={tweet.id} className="pt-8 sm:inline-block sm:w-full sm:px-4">
                <figure className="rounded-2xl bg-dark-50 dark:bg-dark-800/50 p-6 text-sm leading-6 border border-dark-200 dark:border-dark-700 hover:border-dark-300 dark:hover:border-dark-600 transition-colors">
                  <blockquote className="text-dark-900 dark:text-dark-100">
                    <p>“{tweet.content}”</p>
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-x-4">
                    <img className="h-10 w-10 rounded-full bg-dark-50" src={tweet.avatar} alt="" />
                    <div className="flex-auto">
                      <div className="font-semibold text-dark-900 dark:text-white">
                        {tweet.name}
                        <span className="ml-1 text-dark-500 dark:text-dark-400 font-normal">{tweet.handle}</span>
                      </div>
                      <div className="text-dark-500 dark:text-dark-400 text-xs flex items-center gap-1 mt-0.5">
                        <Twitter className="h-3 w-3" />
                        {tweet.date}
                      </div>
                    </div>
                  </figcaption>
                </figure>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
