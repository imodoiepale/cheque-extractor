#!/bin/bash

# Setup Supabase database schema

echo "🚀 Setting up OCR Check Processing database..."

# Run all migrations in order
for migration in supabase/migrations/*.sql; do
  echo "Running migration: $(basename $migration)"
  supabase db push --file "$migration"
done

echo "✅ Database schema created successfully!"

# Optional: Load seed data
read -p "Load seed data for development? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  supabase db push --file supabase/seed/seed.sql
  echo "✅ Seed data loaded!"
fi

echo "🎉 Database setup complete!"