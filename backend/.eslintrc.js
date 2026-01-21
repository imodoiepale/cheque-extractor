module.exports = {
    parser: '@typescript-eslint/parser',
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
    },
    rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
};
```

### **`.gitignore`**
```
# Dependencies
node_modules /

# Build
dist /

# Environment
    .env
    .env.local

# Logs
    *.log
logs /

# IDE
    .vscode /
.idea /

# OS
    .DS_Store
Thumbs.db

# Test
coverage /

# Temp
tmp /
    temp /