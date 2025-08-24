#!/bin/zsh
url="${1:-https://grandmaskitchen.org/admin/workshop.html}"
curl -sI "$url" | egrep -i 'x-admin-mw|cache-control|pragma|expires|x-robots-tag'
