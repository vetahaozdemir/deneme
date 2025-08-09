#!/bin/bash

# Firebase Security Rules Deployment Script
# This script deploys the Firestore security rules for the unified React app

echo "🔒 Deploying Firebase Security Rules..."

# Check if firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed. Please install it first:"
    echo "npm install -g firebase-tools"
    exit 1
fi

# Check if user is logged in
if ! firebase projects:list &> /dev/null; then
    echo "🔐 Please login to Firebase first:"
    echo "firebase login"
    exit 1
fi

# Backup existing rules (if any)
echo "📋 Backing up existing rules..."
firebase firestore:rules:get > firestore.rules.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || echo "No existing rules to backup"

# Validate the rules file
echo "✅ Validating security rules..."
if [ ! -f "firestore.rules" ]; then
    echo "❌ firestore.rules file not found!"
    exit 1
fi

# Test rules syntax
echo "🧪 Testing rules syntax..."
if ! firebase firestore:rules:validate firestore.rules; then
    echo "❌ Rules validation failed!"
    echo "Please fix the syntax errors in firestore.rules"
    exit 1
fi

echo "✅ Rules syntax is valid!"

# Deploy rules
echo "🚀 Deploying rules to Firestore..."
if firebase deploy --only firestore:rules; then
    echo "✅ Rules deployed successfully!"
    echo ""
    echo "📝 Deployment Summary:"
    echo "- Firebase Security Rules updated"
    echo "- Old data structure preserved"
    echo "- New React app data structure protected"
    echo "- User-based access control enabled"
    echo ""
    echo "🔍 Next steps:"
    echo "1. Test data access from the React app"
    echo "2. Verify existing HTML apps still work"
    echo "3. Monitor Firebase console for any rule violations"
    echo ""
    echo "📖 For migration guide, see: FIREBASE_MIGRATION.md"
else
    echo "❌ Rules deployment failed!"
    echo "Check your Firebase project permissions and try again"
    exit 1
fi