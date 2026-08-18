#!/bin/bash
for d in apps/*; do
  if [ -d "$d" ]; then
    git add "$d"
    if ! git diff --staged --quiet; then
      git commit -m "feat($(basename "$d")): update $(basename "$d")"
    fi
  fi
done
for d in packages/*; do
  if [ -d "$d" ]; then
    git add "$d"
    if ! git diff --staged --quiet; then
      git commit -m "feat($(basename "$d")): update $(basename "$d")"
    fi
  fi
done
git add .
if ! git diff --staged --quiet; then
  git commit -m "chore(root): update workspace and configurations"
fi
