# 🔧 Windows Installation Fix

## Issue: Backend npm install fails with opencv4nodejs error

The backend installation was failing because `opencv4nodejs` requires building OpenCV from source, which is complex on Windows and requires Visual Studio build tools.

---

## ✅ **FIXED: opencv4nodejs Removed**

**Good news:** `opencv4nodejs` was listed as a dependency but **not actually used** in the codebase. It was only mentioned in comments as a future enhancement.

### What was changed:
- ✅ Removed `opencv4nodejs` from `backend/package.json`
- ✅ The application uses `sharp` for image processing instead
- ✅ OpenCV features can be added later if needed

---

## 🚀 **Installation Steps (Windows)**

### 1. Clean up previous installation attempts

```powershell
# Navigate to backend directory
cd C:\Users\EPALE\Documents\GitHub\cheque-extractor\backend

# Remove node_modules and lock files
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue

# Also clean root node_modules if it exists
cd ..
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
```

### 2. Install backend dependencies

```powershell
cd backend
npm install
```

This should now complete successfully without the opencv4nodejs error!

---

## 📦 **Current Dependencies**

The backend now uses these image processing libraries:
- **sharp** - Fast image processing (resize, format conversion, etc.)
- **tesseract.js** - OCR text extraction
- **node-tesseract-ocr** - Alternative Tesseract wrapper

All of these work perfectly on Windows without requiring build tools.

---

## ⚠️ **If You Still Have Issues**

### Issue: Files locked by another process
If you see `EBUSY` or `EPERM` errors:

```powershell
# Close all Node.js processes
taskkill /F /IM node.exe

# Close VS Code
# Then reopen and try again
```

### Issue: Permission errors
Run PowerShell as Administrator:
1. Right-click PowerShell
2. Select "Run as Administrator"
3. Navigate to the backend folder
4. Run `npm install`

---

## ✅ **Verification**

After successful installation, you should see:
```
added XXX packages, and audited XXX packages in Xs
```

No opencv4nodejs errors! 🎉

---

## 🔄 **Next Steps**

1. ✅ Frontend dependencies installed
2. ✅ Backend dependencies installed (after cleanup)
3. Create `.env` files (see `SETUP_GUIDE.md`)
4. Run the application

```powershell
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend  
cd frontend
npm run dev
```

---

## 📝 **Note on OpenCV**

If you need advanced image processing features in the future (like contour detection or advanced deskewing), you have these options:

1. **Use Sharp** (current approach) - Works for 90% of use cases
2. **Use opencv4nodejs** - Requires:
   - Visual Studio Build Tools
   - CMake
   - Python
   - Manual OpenCV compilation
3. **Use cloud services** - Google Vision API already provides advanced features

For this check processing application, Sharp + Tesseract + Google Vision AI is sufficient.
