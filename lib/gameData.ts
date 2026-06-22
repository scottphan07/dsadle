export const TIME = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)'];
export const SPACE = ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'];
export const DIFF = ['Beginner', 'Intermediate', 'Advanced'];

export const TOPS: Record<string, string> = {
  'Array': 'Insert / search',
  'Linked List': 'Search',
  'Stack': 'Push / pop',
  'Queue': 'Enqueue / dequeue',
  'Hash Table': 'Lookup (avg)',
  'Binary Search Tree': 'Search (balanced)',
  'AVL Tree': 'Search / insert / delete',
  'Heap': 'Insert / extract',
  'Trie': 'Lookup (by key length)',
  'Graph': 'Traversal',
  'Priority Queue': 'Push / pop',
  'Linear Search': 'Search',
  'Binary Search': 'Search',
  'Bubble Sort': 'Sort',
  'Insertion Sort': 'Sort',
  'Selection Sort': 'Sort',
  'Merge Sort': 'Sort',
  'Quick Sort': 'Sort (avg)',
  'Heap Sort': 'Sort',
  'Breadth-First Search': 'Traversal',
  'Depth-First Search': 'Traversal',
  'Dijkstra': 'Shortest path',
  'Bellman-Ford': 'Shortest path',
  'Topological Sort': 'Ordering',
  'Kadane': 'Max subarray',
  '0/1 Knapsack': 'Optimization',
  'Longest Common Subsequence': 'LCS computation',
};

export interface Entry {
  name: string;
  cat: number; // 0 = data structure, 1 = algorithm
  fam: string;
  t: number;   // index into TIME
  s: number;   // index into SPACE
  d: number;   // index into DIFF
  use: string;
  desc: string;
}

export const ENTRIES: Entry[] = [
  { name: 'Array', cat: 0, fam: 'Array / List', t: 2, s: 2, d: 0, use: 'Storing the pixels in one row of an image', desc: 'Contiguous, index-addressable memory. O(1) random access, but O(n) to search or insert in the middle.' },
  { name: 'Linked List', cat: 0, fam: 'Array / List', t: 2, s: 2, d: 0, use: 'A music playlist you can splice tracks into', desc: 'Nodes joined by pointers. O(1) insert/remove at a known node, O(n) to search.' },
  { name: 'Stack', cat: 0, fam: 'Stack / Queue', t: 0, s: 2, d: 0, use: "The browser back button's history", desc: 'LIFO container. O(1) push and pop. The backbone of recursion, undo, and DFS.' },
  { name: 'Queue', cat: 0, fam: 'Stack / Queue', t: 0, s: 2, d: 0, use: 'Print jobs waiting their turn at a printer', desc: 'FIFO container. O(1) enqueue and dequeue. Used in scheduling and BFS.' },
  { name: 'Hash Table', cat: 0, fam: 'Hash', t: 0, s: 2, d: 1, use: 'Looking up a username to find its account', desc: 'Maps keys to values via a hash function. O(1) average lookup, O(n) worst case under collisions.' },
  { name: 'Binary Search Tree', cat: 0, fam: 'Tree', t: 1, s: 2, d: 1, use: 'Keeping a set of keys in sorted order', desc: 'Ordered tree where left < node < right. O(log n) operations when balanced, O(n) when skewed.' },
  { name: 'AVL Tree', cat: 0, fam: 'Tree', t: 1, s: 2, d: 2, use: 'A database index that stays balanced', desc: 'Self-balancing BST that keeps subtree heights within one. Guarantees O(log n) operations.' },
  { name: 'Heap', cat: 0, fam: 'Heap', t: 1, s: 2, d: 1, use: 'Always serving the highest-priority task next', desc: 'Complete tree obeying the heap order. O(log n) insert and extract, O(1) peek at the min or max.' },
  { name: 'Trie', cat: 0, fam: 'Trie', t: 2, s: 2, d: 2, use: 'Autocomplete suggestions as you type', desc: 'Prefix tree keyed by characters. Lookup is O(k) in the key length, great for autocomplete.' },
  { name: 'Graph', cat: 0, fam: 'Graph', t: 2, s: 3, d: 1, use: 'Modeling a social network of friendships', desc: 'Vertices joined by edges. Models networks, maps, and dependencies; stored as lists or a matrix.' },
  { name: 'Priority Queue', cat: 0, fam: 'Heap', t: 1, s: 2, d: 1, use: 'Scheduling the most urgent event first', desc: 'A queue ordered by priority, usually heap-backed. O(log n) push and pop of the top element.' },
  { name: 'Linear Search', cat: 1, fam: 'Searching', t: 2, s: 0, d: 0, use: 'Finding a name in an unsorted list', desc: 'Scan every element until found. O(n) time, O(1) space, and works on unsorted data.' },
  { name: 'Binary Search', cat: 1, fam: 'Searching', t: 1, s: 0, d: 0, use: 'Looking up a word in a dictionary', desc: 'Halve a sorted range each step. O(log n) time, O(1) space — requires sorted input.' },
  { name: 'Bubble Sort', cat: 1, fam: 'Sorting', t: 4, s: 0, d: 0, use: 'Teaching how sorting works in class', desc: 'Repeatedly swap adjacent out-of-order pairs. O(n²) — a teaching algorithm, not a practical one.' },
  { name: 'Insertion Sort', cat: 1, fam: 'Sorting', t: 4, s: 0, d: 0, use: 'Sorting a small, almost-ordered hand of cards', desc: 'Builds a sorted prefix one element at a time. O(n²) worst, but fast on nearly-sorted data.' },
  { name: 'Selection Sort', cat: 1, fam: 'Sorting', t: 4, s: 0, d: 0, use: 'Sorting when each write is very costly', desc: 'Repeatedly select the minimum and place it. O(n²) regardless of the input order.' },
  { name: 'Merge Sort', cat: 1, fam: 'Sorting', t: 3, s: 2, d: 1, use: 'Stably sorting huge files or linked lists', desc: 'Divide, sort the halves, then merge. Stable O(n log n) time using O(n) extra space.' },
  { name: 'Quick Sort', cat: 1, fam: 'Sorting', t: 3, s: 1, d: 1, use: 'The default in-memory sort in many libraries', desc: 'Partition around a pivot and recurse. O(n log n) average, O(n²) worst, sorts in place.' },
  { name: 'Heap Sort', cat: 1, fam: 'Sorting', t: 3, s: 0, d: 1, use: 'Sorting with no extra memory and a guaranteed bound', desc: 'Build a heap, then repeatedly extract the max. O(n log n) time using O(1) extra space.' },
  { name: 'Breadth-First Search', cat: 1, fam: 'Graph', t: 2, s: 2, d: 1, use: 'Finding the fewest moves to solve a puzzle', desc: 'Explore a graph level by level with a queue. Finds shortest paths in unweighted graphs.' },
  { name: 'Depth-First Search', cat: 1, fam: 'Graph', t: 2, s: 2, d: 1, use: 'Exploring every path of a maze fully', desc: 'Dive as deep as possible via a stack or recursion. Used for cycle detection and topological order.' },
  { name: 'Dijkstra', cat: 1, fam: 'Graph', t: 3, s: 2, d: 2, use: 'GPS routing across a road map', desc: 'Shortest paths from a source with non-negative weights. O(E log V) with a binary heap.' },
  { name: 'Bellman-Ford', cat: 1, fam: 'Graph', t: 4, s: 2, d: 2, use: 'Routing or arbitrage with negative costs', desc: 'Shortest paths that tolerate negative edges. O(V·E), and detects negative cycles.' },
  { name: 'Topological Sort', cat: 1, fam: 'Graph', t: 2, s: 2, d: 2, use: 'Ordering tasks that have prerequisites', desc: "Linear ordering of a DAG that respects all dependencies. O(V + E) via DFS or Kahn's algorithm." },
  { name: 'Kadane', cat: 1, fam: 'Dynamic Programming', t: 2, s: 0, d: 1, use: 'Finding the best buy/sell window for max profit', desc: 'Maximum subarray sum in a single pass. O(n) time, O(1) space — a classic 1-D DP.' },
  { name: '0/1 Knapsack', cat: 1, fam: 'Dynamic Programming', t: 4, s: 2, d: 2, use: 'Picking items to maximize value under a weight cap', desc: 'Maximize value under a weight cap with a DP table. O(n·W) time and space.' },
  { name: 'Longest Common Subsequence', cat: 1, fam: 'Dynamic Programming', t: 4, s: 3, d: 2, use: 'Diffing two files or comparing DNA strands', desc: 'Longest subsequence shared by two strings via a 2-D DP table. O(m·n) time and space.' },
];

export const CODE: Record<string, string> = {
  'Array': `arr = [10, 20, 30, 40]
x = arr[2]          # O(1) random access -> 30
arr.append(50)      # amortized O(1)
arr.insert(1, 15)   # O(n): shifts the rest right
del arr[0]          # O(n): shifts the rest left`,

  'Linked List': `class Node:
    def __init__(self, val):
        self.val = val
        self.next = None

class LinkedList:
    def __init__(self):
        self.head = None

    def push_front(self, val):   # O(1)
        node = Node(val)
        node.next = self.head
        self.head = node`,

  'Stack': `stack = []
stack.append(1)     # push   O(1)
stack.append(2)
top = stack[-1]     # peek   O(1)
stack.pop()         # pop    O(1)  -> returns 2 (last in)`,

  'Queue': `from collections import deque

q = deque()
q.append(1)         # enqueue   O(1)
q.append(2)
front = q[0]        # peek      O(1)
q.popleft()         # dequeue   O(1)  -> returns 1 (first in)`,

  'Hash Table': `table = {}
table["alice"] = 42      # insert      O(1) avg
value = table["alice"]   # lookup      O(1) avg
exists = "bob" in table  # membership  O(1) avg
del table["alice"]       # delete      O(1) avg`,

  'Binary Search Tree': `class Node:
    def __init__(self, key):
        self.key = key
        self.left = self.right = None

def insert(root, key):
    if not root:
        return Node(key)
    if key < root.key:
        root.left = insert(root.left, key)
    else:
        root.right = insert(root.right, key)
    return root`,

  'AVL Tree': `def balance(n):                 # heights kept up to date
    return height(n.left) - height(n.right)

def rotate_right(y):            # fix a left-heavy node
    x = y.left
    y.left = x.right
    x.right = y
    update_height(y)
    update_height(x)
    return x                    # new subtree root

# after every insert: if |balance| > 1, rotate`,

  'Heap': `import heapq

heap = []
heapq.heappush(heap, 5)     # O(log n)
heapq.heappush(heap, 1)
heapq.heappush(heap, 3)
smallest = heap[0]          # peek min   O(1)
heapq.heappop(heap)         # extract    O(log n) -> 1`,

  'Trie': `class Trie:
    def __init__(self):
        self.children = {}
        self.end = False

    def insert(self, word):
        node = self
        for ch in word:        # O(k) in key length
            node = node.children.setdefault(ch, Trie())
        node.end = True`,

  'Graph': `graph = {
    "A": ["B", "C"],
    "B": ["A", "D"],
    "C": ["A", "D"],
    "D": ["B", "C"],
}
neighbors = graph["A"]      # adjacency list -> ["B", "C"]`,

  'Priority Queue': `import heapq

pq = []
heapq.heappush(pq, (2, "email"))    # (priority, task)
heapq.heappush(pq, (1, "alarm"))
heapq.heappush(pq, (3, "backup"))
prio, task = heapq.heappop(pq)      # -> (1, "alarm")`,

  'Linear Search': `def search(arr, target):
    for i, x in enumerate(arr):     # O(n)
        if x == target:
            return i
    return -1                       # not found`,

  'Binary Search': `def search(arr, target):            # arr must be sorted
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2        # halve the range
        if arr[mid] == target:
            return mid
        if arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1`,

  'Bubble Sort': `def sort(a):
    n = len(a)
    for i in range(n):
        for j in range(n - i - 1):
            if a[j] > a[j + 1]:         # swap adjacent pair
                a[j], a[j + 1] = a[j + 1], a[j]
    return a                            # O(n^2)`,

  'Insertion Sort': `def sort(a):
    for i in range(1, len(a)):
        key = a[i]
        j = i - 1
        while j >= 0 and a[j] > key:    # shift bigger items right
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = key                  # drop key into place
    return a`,

  'Selection Sort': `def sort(a):
    n = len(a)
    for i in range(n):
        m = i
        for j in range(i + 1, n):       # find the minimum
            if a[j] < a[m]:
                m = j
        a[i], a[m] = a[m], a[i]         # one swap per pass
    return a`,

  'Merge Sort': `def sort(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    left = sort(a[:mid])
    right = sort(a[mid:])
    return merge(left, right)           # divide & conquer

def merge(l, r):
    out, i, j = [], 0, 0
    while i < len(l) and j < len(r):
        if l[i] <= r[j]:
            out.append(l[i]); i += 1
        else:
            out.append(r[j]); j += 1
    return out + l[i:] + r[j:]`,

  'Quick Sort': `def sort(a):
    if len(a) <= 1:
        return a
    pivot = a[len(a) // 2]              # choose a pivot
    less    = [x for x in a if x < pivot]
    equal   = [x for x in a if x == pivot]
    greater = [x for x in a if x > pivot]
    return sort(less) + equal + sort(greater)`,

  'Heap Sort': `import heapq

def sort(a):
    heapq.heapify(a)                    # build heap   O(n)
    return [heapq.heappop(a)            # extract min  O(log n)
            for _ in range(len(a))]     # total O(n log n)`,

  'Breadth-First Search': `from collections import deque

def traverse(graph, start):
    seen, q, order = {start}, deque([start]), []
    while q:
        node = q.popleft()              # FIFO -> level by level
        order.append(node)
        for nb in graph[node]:
            if nb not in seen:
                seen.add(nb)
                q.append(nb)
    return order`,

  'Depth-First Search': `def traverse(graph, node, seen=None):
    if seen is None:
        seen = set()
    seen.add(node)
    for nb in graph[node]:              # go as deep as possible
        if nb not in seen:
            traverse(graph, nb, seen)
    return seen`,

  'Dijkstra': `import heapq

def shortest(graph, src):              # weights >= 0
    dist = {src: 0}
    pq = [(0, src)]
    while pq:
        d, u = heapq.heappop(pq)       # closest unsettled node
        for v, w in graph[u]:
            nd = d + w
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    return dist`,

  'Bellman-Ford': `def shortest(edges, n, src):           # handles negative weights
    dist = [float("inf")] * n
    dist[src] = 0
    for _ in range(n - 1):             # relax all edges V-1 times
        for u, v, w in edges:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
    return dist`,

  'Topological Sort': `from collections import deque

def order(graph, indeg):               # graph must be a DAG
    q = deque([u for u in graph if indeg[u] == 0])
    result = []
    while q:
        u = q.popleft()
        result.append(u)
        for v in graph[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                q.append(v)
    return result`,

  'Kadane': `def max_subarray(a):
    best = cur = a[0]
    for x in a[1:]:
        cur = max(x, cur + x)          # extend or restart
        best = max(best, cur)
    return best                        # O(n), O(1) space`,

  '0/1 Knapsack': `def solve(weights, values, cap):
    n = len(weights)
    dp = [[0] * (cap + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for w in range(cap + 1):
            dp[i][w] = dp[i - 1][w]            # skip item i
            if weights[i - 1] <= w:            # or take it
                dp[i][w] = max(dp[i][w],
                    values[i - 1] + dp[i - 1][w - weights[i - 1]])
    return dp[n][cap]`,

  'Longest Common Subsequence': `def solve(a, b):
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp[m][n]`,
};
