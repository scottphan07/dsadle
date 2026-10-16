"""The controlled tag vocabulary for question families.

A question carries one or more of these slugs (rows in `question_tags`). The
list is closed on purpose: free text fragments a filter ("Tree" vs "Trees" vs
"Binary Tree"), so validate_seed.py and the admin API reject anything not here.

Order is display order in the sandbox filter.
"""

TAGS: dict[str, str] = {
    "linear": "Linear",
    "tree": "Tree",
    "graph": "Graph",
    "heap": "Heap",
    "hashing": "Hashing",
    "sorting": "Sorting",
    "searching": "Searching",
    "string": "String",
    "dynamic-programming": "Dynamic Programming",
    "greedy": "Greedy",
    "divide-and-conquer": "Divide & Conquer",
    "range-query": "Range Query",
    "spatial": "Spatial",
    "probabilistic": "Probabilistic",
    "math": "Math",
}
