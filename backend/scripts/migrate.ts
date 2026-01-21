import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigrations() {
    try {
        console.log('🚀 Starting database migrations...\n');

        const migrationsDir = path.join(__dirname, '../../supabase/migrations');

        // Check if migrations directory exists
        try {
            await fs.access(migrationsDir);
        } catch {
            console.log('❌ Migrations directory not found');
            console.log('Expected path:', migrationsDir);
            process.exit(1);
        }

        // Read all migration files
        const files = await fs.readdir(migrationsDir);
        const sqlFiles = files
            .filter(file => file.endsWith('.sql'))
            .sort(); // Sort to run in order

        console.log(`Found ${sqlFiles.length} migration files\n`);

        for (const file of sqlFiles) {
            console.log(`Running migration: ${file}`);

            const filePath = path.join(migrationsDir, file);
            const sql = await fs.readFile(filePath, 'utf-8');

            // Execute migration
            const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

            if (error) {
                console.error(`❌ Failed to run migration: ${file}`);
                console.error(error);
                process.exit(1);
            }

            console.log(`✅ ${file} completed\n`);
        }

        console.log('🎉 All migrations completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigrations();