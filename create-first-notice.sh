#!/bin/bash

# Create first test notice via API
echo "📢 Creating first test notice..."

ADMIN_TOKEN="your-admin-token-here"  # Replace with actual admin token

curl -X POST "https://matka-api-server.onrender.com/api/notices/broadcast" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "title": "🎉 Welcome to Matka Pro",
    "content": "Welcome to our platform! Place your bets wisely and enjoy the game.",
    "isActive": true
  }'

echo ""
echo "✅ Notice created!"
echo ""
echo "Check admin panel: Refresh the page to see the notice appear"
