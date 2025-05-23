#!/usr/bin/env python3
print("=== SIMPLE TEST START ===")
print("Python is working")

import os
print("os module imported")

query = os.getenv("QUERY")
print(f"QUERY from env: {query}")

callback_url = os.getenv("CALLBACK_URL") 
print(f"CALLBACK_URL from env: {callback_url}")

print("=== SIMPLE TEST END ===") 