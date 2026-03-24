#!/bin/bash
# Step 1: Add git remote
git remote add matkaapp https://github.com/Mukeem001/matkaapp.git

# Step 2: Push all changes
git add -A
git commit -m "chore: prepare for Hostinger deployment - fix JWT secrets, SSL, and build configuration"
git branch -M main
git push -u matkaapp main

echo "✅ Successfully pushed to https://github.com/Mukeem001/matkaapp.git"
