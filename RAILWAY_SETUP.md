# Railway.app Deployment Setup

## The Database Persistence Issue

By default, Railway containers have **ephemeral storage** - data is lost on every deployment. This caused your xpubs to disappear after reloading.

## Solution: Railway Persistent Volume

Follow these steps to ensure your SQLite database persists across deployments:

### 1. Add a Persistent Volume

1. Go to your Railway project: https://railway.app
2. Click on your **MultisigHelper service**
3. Click on the **"Variables"** tab
4. Scroll down and click **"+ New Volume"**
5. Configure the volume:
   - **Mount Path**: `/data`
   - Click **"Add"**

### 2. Add Environment Variable

Still in the Variables tab:

1. Click **"+ New Variable"**
2. Add:
   - **Variable**: `RAILWAY_VOLUME_MOUNT_PATH`
   - **Value**: `/data`
3. Click **"Add"**

### 3. Deploy

Railway will automatically redeploy with the new configuration. Your database will now persist at `/data/data.db` in the container.

## How It Works

The updated code in `server/database.js`:
```javascript
// Checks for Railway volume environment variable
if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  // Use persistent storage at /data/data.db
  const dbPath = path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'data.db');
} else {
  // Fallback to local development: server/data.db
  const dbPath = path.join(__dirname, 'data.db');
}
```

## Verification

After deployment, check the Railway logs. You should see:
```
Using persistent database at: /data/data.db
```

Instead of:
```
Using local database at: /app/server/data.db
```

## Testing

1. Add an xpub
2. Trigger a new deployment (push a change to GitHub)
3. Refresh the page - your xpub should still be there! ✅

## Alternative: PostgreSQL

For production use with multiple users, consider switching to Railway's PostgreSQL:

1. In Railway dashboard, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Update code to use `pg` instead of `sqlite3`

PostgreSQL provides:
- Better concurrency
- Automatic backups
- More reliable for production
- Better query performance

But for this demo app, SQLite with a persistent volume works great!

## Troubleshooting

**Issue**: Data still disappearing
- **Check**: Ensure `RAILWAY_VOLUME_MOUNT_PATH` is set to `/data`
- **Check**: Volume mount path matches the environment variable
- **Check**: Railway logs show "Using persistent database at: /data/data.db"

**Issue**: Database errors after adding volume
- **Solution**: Delete the old non-persistent database by redeploying
- The app will create a fresh database in the persistent location

## Need Help?

Check Railway documentation: https://docs.railway.app/reference/volumes
