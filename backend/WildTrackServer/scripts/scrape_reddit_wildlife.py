"""
Simple Reddit scraper for endangered species posts.

Focus: Get recent Reddit posts about endangered species for analytics dashboard.
No complex location extraction - just get posts mentioning endangered species.

Requirements:
    pip install requests

No Reddit API keys needed! Uses public JSON endpoints.
"""

import requests
from datetime import datetime
from typing import List, Dict, Optional
import time

# Endangered species list
ENDANGERED_SPECIES = [
    'tiger', 'elephant', 'rhino', 'rhinoceros', 'gorilla', 'orangutan',
    'panda', 'polar bear', 'jaguar', 'leopard', 'snow leopard', 'cheetah',
    'whale', 'dolphin', 'manatee', 'sea turtle', 'sea otter', 'wolf',
    'bison', 'bear', 'lynx', 'bobcat', 'cougar', 'mountain lion',
    'condor', 'eagle', 'vulture', 'albatross', 'penguin', 'crane',
    'whooping crane', 'bald eagle', 'harpy eagle', 'owl', 'hawk',
    'tortoise', 'komodo dragon', 'alligator', 'crocodile',
    'shark', 'sturgeon', 'salmon', 'tuna',
]

# Wildlife subreddits
WILDLIFE_SUBREDDITS = [
    'wildlife',
    'animalid',
    'nature',
    'birding',
    'whatsthisbird',
    'conservation',
    'ecology',
    'wildlifephotography',
    'naturephotography',
]


class SimpleRedditScraper:
    """Simple Reddit scraper for endangered species posts."""
    
    def __init__(self, user_agent: str = "WildTrackBot/1.0"):
        """Initialize scraper."""
        self.base_url = "https://www.reddit.com"
        self.headers = {"User-Agent": user_agent}
        self.session = requests.Session()
        self.session.headers.update(self.headers)
        self.stats = {
            'posts_checked': 0,
            'posts_found': 0,
            'start_time': time.time(),
        }
        print(f"✓ Reddit Scraper initialized")
        print(f"  Looking for posts about {len(ENDANGERED_SPECIES)} endangered species")
    
    def mentions_endangered_species(self, text: str) -> List[str]:
        """Check if text mentions any endangered species."""
        text_lower = text.lower()
        found_species = []
        
        for species in ENDANGERED_SPECIES:
            if species.lower() in text_lower:
                found_species.append(species.title())
        
        return list(set(found_species))
    
    def _make_request(self, url: str, params: Optional[Dict] = None) -> Dict:
        """Make a request to Reddit's JSON API."""
        try:
            response = self.session.get(url, params=params, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"    ⚠️  Request error: {e}")
            return {}
    
    def get_posts_about_species(self, subreddit_name: str, max_posts: int = 50) -> List[Dict]:
        """
        Get recent posts from a subreddit that mention endangered species.
        """
        posts = []
        after = None
        pages_checked = 0
        max_pages = 3
        
        print(f"    📥 Scraping r/{subreddit_name}...")
        
        try:
            while len(posts) < max_posts and pages_checked < max_pages:
                pages_checked += 1
                
                url = f"{self.base_url}/r/{subreddit_name}/new.json"
                params = {"limit": 100}
                if after:
                    params["after"] = after
                
                data = self._make_request(url, params)
                
                if not data or "data" not in data:
                    break
                
                after = data["data"].get("after")
                children = data["data"].get("children", [])
                
                for child in children:
                    if len(posts) >= max_posts:
                        break
                    
                    post_data = child.get("data", {})
                    self.stats['posts_checked'] += 1
                    
                    # Skip old posts (last 30 days)
                    created_utc = post_data.get("created_utc", 0)
                    if created_utc:
                        post_age_days = (datetime.now().timestamp() - created_utc) / 86400
                        if post_age_days > 30:
                            continue
                    
                    # Get title and content
                    title = post_data.get("title", "").strip()
                    selftext = post_data.get("selftext", "")
                    text = f"{title} {selftext}"
                    
                    # Check if mentions endangered species
                    species_list = self.mentions_endangered_species(text)
                    if not species_list:
                        continue
                    
                    # Parse timestamp
                    timestamp = None
                    if created_utc:
                        try:
                            timestamp = datetime.fromtimestamp(created_utc)
                        except:
                            pass
                    
                    # Build permalink
                    permalink = post_data.get("permalink", "")
                    if permalink and not permalink.startswith("http"):
                        reddit_url = f"https://reddit.com{permalink}"
                    else:
                        reddit_url = permalink or f"https://reddit.com/r/{subreddit_name}"
                    
                    post = {
                        'reddit_id': post_data.get("id", ""),
                        'title': title,
                        'content': selftext[:500] if selftext else None,
                        'species': species_list,
                        'timestamp': timestamp,
                        'url': reddit_url,
                        'subreddit': subreddit_name,
                        'score': post_data.get("score", 0),
                        'num_comments': post_data.get("num_comments", 0),
                        'author': post_data.get("author", "[deleted]"),
                        'created_utc': created_utc,
                    }
                    
                    posts.append(post)
                    self.stats['posts_found'] += 1
                    print(f"      ✅ Found: '{title[:60]}...' | Species: {', '.join(species_list)}")
                
                if not after:
                    break
                
                time.sleep(1)  # Rate limiting
            
        except Exception as e:
            print(f"    ❌ Error scraping r/{subreddit_name}: {e}")
        
        return posts
    
    def scrape_all(self, max_total: int = 100) -> List[Dict]:
        """
        Scrape all subreddits for posts about endangered species.
        """
        all_posts = []
        seen_ids = set()
        
        print(f"\n🎯 Starting scrape (target: {max_total} posts)\n")
        
        for subreddit in WILDLIFE_SUBREDDITS:
            if len(all_posts) >= max_total:
                break
            
            remaining = max_total - len(all_posts)
            posts = self.get_posts_about_species(subreddit, max_posts=min(remaining, 20))
            
            for post in posts:
                if post['reddit_id'] not in seen_ids:
                    seen_ids.add(post['reddit_id'])
                    all_posts.append(post)
                    if len(all_posts) >= max_total:
                        break
            
            print(f"    📊 r/{subreddit}: {len([p for p in all_posts if p.get('subreddit') == subreddit])} posts found")
            print(f"       Total: {len(all_posts)}/{max_total}\n")
            
            time.sleep(2)  # Rate limiting
        
        elapsed = time.time() - self.stats['start_time']
        print(f"{'='*60}")
        print(f"📊 STATISTICS")
        print(f"{'='*60}")
        print(f"  Posts checked: {self.stats['posts_checked']}")
        print(f"  Posts found: {self.stats['posts_found']}")
        print(f"  Time elapsed: {elapsed:.1f} seconds")
        print(f"  Final count: {len(all_posts)} posts")
        print(f"{'='*60}\n")
        
        return all_posts[:max_total]


def main():
    """Main function to run the scraper."""
    print("=" * 60)
    print("Reddit Endangered Species Scraper")
    print("Getting recent posts about endangered species")
    print("=" * 60)
    
    scraper = SimpleRedditScraper()
    posts = scraper.scrape_all(max_total=100)
    
    print(f"\n✅ RESULT: {len(posts)} posts found")
    
    if posts:
        print("\n📋 Sample posts (first 5):")
        for i, post in enumerate(posts[:5], 1):
            print(f"\n{i}. {post['title'][:60]}...")
            print(f"   Species: {', '.join(post['species'])}")
            print(f"   Subreddit: r/{post['subreddit']}")
            print(f"   Score: {post['score']} | Comments: {post['num_comments']}")
            print(f"   URL: {post['url']}")
    
    return posts


if __name__ == "__main__":
    posts = main()
