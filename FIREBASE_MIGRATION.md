# Firebase Data Migration Guide

## Overview
This document outlines the data structure migration from the original HTML applications to the unified React TypeScript application while preserving existing data and ensuring compatibility.

## Original Data Structure
The original applications used these Firebase collection patterns:
- `library_books/` - Book collection data
- `expenses/` - Financial tracking data  
- `fitness_data/` - Workout and health data
- `tasks/` - Task management data
- `projects/` - Project data
- `goals/` - Goal tracking data
- `camps/` - Camp system data

## New Unified Structure
The React app uses a hierarchical user-based structure:

### Main User Collections
```
users/{userId}/
├── library_books/          # Books and reading data
├── expenses/               # Financial tracking
├── workouts/              # Fitness data (renamed from fitness_data)
├── weights/               # Weight tracking
├── tasks/                 # Task management
├── projects/              # Project data
├── products/              # Stock management (Stok Yönetimi)
├── cocukBilgiData/        # Child information system
└── camps/                 # Camp/Goals system
```

### App Configuration
```
appConfig/{userId}          # Navigation and app settings
userData/{userId}/          # Additional user data
├── products/              # Product catalog for stock management
└── sales/                 # Sales records
```

## Data Migration Strategy

### 1. Backwards Compatibility
The React app can read from both old and new data structures:
- Checks new structure first: `users/{userId}/collection_name`
- Falls back to old structure: `collection_name/{userId}` or documents with `userId` field
- Migrates data automatically when accessed

### 2. Safe Migration Process
1. **Read existing data** from original locations
2. **Copy to new structure** without deleting originals
3. **Update data format** to match React app interfaces
4. **Maintain references** between related documents

### 3. Data Transformation Examples

#### Library Books Migration
```javascript
// Original: library_books/{bookId} with userId field
{
  userId: "user123",
  title: "Kitap Adı",
  author: "Yazar",
  status: "Okudum"
}

// New: users/{userId}/library_books/{bookId}
{
  title: "Kitap Adı", 
  author: "Yazar",
  status: "Okudum",
  createdAt: timestamp,
  updatedAt: timestamp
}
```

#### Fitness Data Migration
```javascript
// Original: fitness_data/{recordId}
{
  userId: "user123",
  type: "workout",
  data: {...}
}

// New: users/{userId}/workouts/{recordId}
{
  type: "strength",
  name: "Bench Press",
  sets: [{reps: 10, weight: 80}],
  date: timestamp
}
```

## Firebase Security Rules

The security rules protect both old and new data:

### User Data Protection
```javascript
// New structure - full access to own data
match /users/{userId} {
  allow read, write: if request.auth.uid == userId;
  match /{subcollection=**} {
    allow read, write: if request.auth.uid == userId;
  }
}

// Legacy collections - backwards compatibility
match /library_books/{document} {
  allow read, write: if request.auth != null && 
    resource.data.userId == request.auth.uid;
}
```

### Data Validation
```javascript
function isValidData(data) {
  return data.keys().hasAll(['createdAt', 'updatedAt']) &&
         data.createdAt is timestamp &&
         data.updatedAt is timestamp;
}
```

## Application-Specific Notes

### 1. Kütüphanem (Library)
- **Old**: `library_books/` collection with userId field
- **New**: `users/{userId}/library_books/` subcollection
- **Features**: Reading progress tracking, goal setting, statistics
- **Migration**: Preserves reading history and current page progress

### 2. Harçlık (Expense Tracking)
- **Old**: `expenses/` collection 
- **New**: `users/{userId}/expenses/` subcollection
- **Features**: Income/expense tracking, categorization, budgets
- **Migration**: Maintains transaction history and categories

### 3. Fitness App
- **Old**: `fitness_data/` collection
- **New**: `users/{userId}/workouts/` and `users/{userId}/weights/`
- **Features**: Workout logging, weight tracking, progress charts
- **Migration**: Converts old format to structured workout records

### 4. İşler (Tasks)
- **Old**: `tasks/` collection
- **New**: `users/{userId}/tasks/` subcollection  
- **Features**: Project management, task tracking, time logging
- **Migration**: Preserves task relationships and project associations

### 5. Pusula (Goals/Camps)
- **Old**: `goals/` and `camps/` collections
- **New**: `users/{userId}/camps/` subcollection
- **Features**: Progressive goal system, streak tracking, achievements
- **Migration**: Maintains goal history and progress calculations

### 6. Stok Yönetimi (Stock Management)
- **New**: `userData/{userId}/products/` subcollection
- **Features**: Inventory management, sales tracking, profit calculations
- **Data**: Product catalog, stock levels, sales transactions

### 7. Çocuk Bilgi (Child Information)
- **New**: `users/{userId}/cocukBilgiData/main` document
- **Features**: Child profiles, health records, education tracking
- **Structure**: Nested data with child profiles and related records

## Implementation Details

### Data Loading Pattern
```javascript
const loadData = async () => {
  try {
    // Try new structure first
    const newDataRef = doc(db, 'users', userId, 'collection', 'document');
    const newDoc = await getDoc(newDataRef);
    
    if (newDoc.exists()) {
      return newDoc.data();
    }
    
    // Fallback to old structure
    const oldDataRef = doc(db, 'old_collection', userId);
    const oldDoc = await getDoc(oldDataRef);
    
    if (oldDoc.exists()) {
      // Migrate data to new structure
      const migratedData = transformOldData(oldDoc.data());
      await setDoc(newDataRef, migratedData);
      return migratedData;
    }
    
    // Load demo data if no existing data
    return loadDemoData();
  } catch (error) {
    console.error('Data loading error:', error);
    return loadDemoData();
  }
};
```

### Automatic Migration
The React app automatically:
1. Detects old data format
2. Transforms to new structure
3. Writes to new location
4. Continues using new structure
5. Preserves original data as backup

## Deployment Considerations

### 1. Gradual Rollout
- Deploy React app alongside existing HTML apps
- Users can switch between interfaces
- Data stays synchronized between both versions

### 2. Data Backup
- Original data remains untouched
- New structure created as addition, not replacement
- Easy rollback if issues occur

### 3. Performance Optimization
- Indexes created for frequently queried fields
- Subcollection structure improves query performance
- Real-time listeners only on user's own data

## Monitoring and Maintenance

### Health Checks
- Monitor successful data migrations
- Track any failed transformations
- Alert on security rule violations

### Data Integrity
- Validate migrated data structure
- Check for missing required fields
- Ensure referential integrity between collections

## Troubleshooting

### Common Issues
1. **Permission denied**: Check security rules match data structure
2. **Missing data**: Verify migration completed successfully  
3. **Format errors**: Check data transformation functions
4. **Performance**: Review query patterns and indexes

### Recovery Procedures
1. **Data loss**: Restore from original collections
2. **Migration errors**: Reset to demo data and retry
3. **Rule conflicts**: Update security rules to match data access patterns