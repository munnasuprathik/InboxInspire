# Railway Deployment Guide - Tend Backend

## 🚂 Railway Deployment Options

Railway offers **two deployment methods**. You can choose either:

> **Note**: The same Dockerfile works for Railway, Heroku, AWS, GCP, Azure, DigitalOcean, and even Kubernetes! You have maximum flexibility. 🎯

### Option 1: Docker Deployment (Recommended) ✅
- **Pros**: Consistent environment, easier debugging, portable
- **Cons**: Slightly larger initial build time
- **Files Needed**: `Dockerfile` (already created)

### Option 2: Direct Python Deployment
- **Pros**: Faster initial builds, simpler setup
- **Cons**: Less control over environment
- **Files Needed**: `requirements.txt` (already exists)

---

## 📋 Quick Start (Docker - Recommended)

### 1. Connect Railway to Your Repository

1. Go to [Railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Railway will auto-detect the Dockerfile

### 2. Set Environment Variables

In Railway Dashboard → Your Service → Variables, add:

**Required:**
```
MONGO_URL=mongodb+srv://user:pass@cluster.mongodb.net/tend
OPENAI_API_KEY=sk-...
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USERNAME=your-email@domain.com
SMTP_PASSWORD=your-password
CLERK_SECRET_KEY=sk_live_...
ADMIN_SECRET=your-secret-key-here
FRONTEND_URL=https://maketend.com
CORS_ORIGINS=https://maketend.com,https://*.vercel.app
ENVIRONMENT=production
```

**Optional:**
```
TAVILY_API_KEY=...
IMAP_HOST=imap.hostinger.com
INBOX_EMAIL=mail@domain.com
INBOX_PASSWORD=...
EMAIL_DOMAIN=maketend.com
DB_NAME=tend
PORT=8000
```

### 3. Deploy

Railway will automatically:
- Build the Docker image
- Deploy the service
- Assign a public URL (e.g., `https://your-app.up.railway.app`)

### 4. Get Your Backend URL

After deployment:
1. Go to Railway Dashboard → Your Service → Settings
2. Copy the **Public Domain** (e.g., `https://your-app.up.railway.app`)
3. Use this as your `REACT_APP_BACKEND_URL` in Vercel

---

## 📋 Quick Start (Direct Python - Alternative)

If you prefer NOT to use Docker:

### 1. Create `Procfile` (for Railway)

Create a file named `Procfile` in the root directory:

```
web: cd backend && python -m uvicorn server:app --host 0.0.0.0 --port $PORT
```

### 2. Create `runtime.txt` (optional - specify Python version)

```
python-3.11.0
```

### 3. Deploy

Railway will:
- Detect Python automatically
- Install from `requirements.txt`
- Run the Procfile command

---

## 🔧 Configuration

### Port Configuration

Railway automatically sets the `PORT` environment variable. The Dockerfile and Procfile handle this automatically.

### Health Checks

Railway will automatically check `/health` endpoint. Make sure it's working:
```bash
curl https://your-app.up.railway.app/health
```

### Logs

View logs in Railway Dashboard → Your Service → Deployments → View Logs

---

## 🚀 Deployment Checklist

- [ ] Repository connected to Railway
- [ ] All environment variables set
- [ ] MongoDB connection string configured
- [ ] SMTP credentials configured
- [ ] Clerk secret key configured
- [ ] Frontend URL set in `FRONTEND_URL`
- [ ] CORS origins configured
- [ ] Health check endpoint working
- [ ] Backend URL copied for frontend configuration

---

## 🔍 Troubleshooting

### Build Fails
- Check Railway logs for error messages
- Verify `requirements.txt` is correct
- Ensure Dockerfile syntax is valid

### Service Won't Start
- Check environment variables are set
- Verify MongoDB connection string
- Check logs for startup errors

### Health Check Fails
- Ensure `/health` endpoint is accessible
- Check if database connection is working
- Verify all required env vars are set

---

## 📊 Monitoring

Railway provides:
- **Metrics**: CPU, Memory, Network usage
- **Logs**: Real-time application logs
- **Deployments**: Deployment history and rollback

---

## 💰 Cost Considerations

Railway pricing:
- **Hobby Plan**: $5/month (500 hours free, then $0.000463/hour)
- **Pro Plan**: $20/month (unlimited usage)

For production with 10k+ users, Pro Plan is recommended.

---

## ✅ Recommended: Use Docker

**Why Docker is recommended:**
1. **Consistency**: Same environment locally and in production
2. **Debugging**: Easier to reproduce issues
3. **Portability**: Can deploy to other platforms (AWS, GCP, etc.)
4. **Control**: Full control over Python version and dependencies

**The Dockerfile is already created and ready to use!**

---

## 🎯 Next Steps

1. **Deploy to Railway** using the Dockerfile
2. **Get your backend URL** from Railway
3. **Update Vercel** with the backend URL in `REACT_APP_BACKEND_URL`
4. **Test the connection** between frontend and backend
5. **Monitor logs** for any issues

---

**You're all set! Railway will handle everything else automatically.** 🚀

---

## 🔄 Deployment Flexibility

The Dockerfile I created works for **multiple platforms**:

- ✅ **Railway** (recommended for you)
- ✅ **Heroku** (with Procfile)
- ✅ **AWS ECS/Fargate**
- ✅ **Google Cloud Run**
- ✅ **Azure Container Instances**
- ✅ **DigitalOcean App Platform**
- ✅ **Kubernetes** (if you have a cluster - see `KUBERNETES_DEPLOYMENT.md`)

**Same Docker image, deploy anywhere!** 🎯

