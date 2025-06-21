const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const DISCORD_WEBHOOK_URL = process.env.WEBHOOK_URL;
const YOUTUBE_VIDEO_ID = process.env.YOUTUBE_VIDEO_ID;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const COOLDOWN_TIME = 30 * 1000;

let cooldowns = {};

// ✅ Function to get stream start time
async function getStreamStartTime() {
    try {
        const response = await axios.get(
            `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${YOUTUBE_VIDEO_ID}&key=${YOUTUBE_API_KEY}`
        );
        const streamDetails = response.data.items[0]?.liveStreamingDetails;
        return streamDetails?.actualStartTime
            ? Math.floor(new Date(streamDetails.actualStartTime).getTime() / 1000)
            : null;
    } catch (error) {
        console.error("❌ Error fetching stream start time:", error.message);
        return null;
    }
}

// ✅ /clip route – sends instantly
app.get("/clip", async (req, res) => {
    const user = req.query.user || "Unknown User";
    const message = req.query.message || "No message provided.";
    const now = Math.floor(Date.now() / 1000);

    if (!DISCORD_WEBHOOK_URL) {
        return res.status(500).json({ error: "❌ Webhook URL not set." });
    }

    if (cooldowns[user] && now - cooldowns[user] < COOLDOWN_TIME / 1000) {
        const timeLeft = Math.ceil(COOLDOWN_TIME / 1000 - (now - cooldowns[user]));
        return res.status(429).json({ error: `⚠️ Too many requests! Wait ${timeLeft}s.` });
    }

    cooldowns[user] = now;

    const streamStartTime = await getStreamStartTime();
    if (!streamStartTime) {
        return res.status(500).json({ error: "❌ Could not fetch stream start time." });
    }

    const timestamp = Math.max(now - streamStartTime - 150, 0);
    const clipUrl = `https://youtu.be/${YOUTUBE_VIDEO_ID}?t=${timestamp}`;
    const msg = `🎬 **New Clip from ${user}!**\n📢 Message: "${message}"\n🔗 [Watch Clip](${clipUrl})`;

    try {
        await axios.post(DISCORD_WEBHOOK_URL, { content: msg });
        res.json({ success: true, info: "✅ Clip sent instantly to Discord." });
    } catch (error) {
        if (error.response?.status === 429) {
            const retryAfter = (error.response.headers["retry-after"] || 10);
            return res.status(429).json({ error: `🚫 Rate limited. Try again after ${retryAfter} seconds.` });
        } else {
            console.error("❌ Failed to send message:", error.message);
            return res.status(500).json({ error: "❌ Failed to send message to Discord." });
        }
    }
});

// ✅ /ping route – sends instantly
app.get("/ping", async (req, res) => {
    if (!DISCORD_WEBHOOK_URL) {
        return res.status(500).send("❌ Webhook URL not set.");
    }

    try {
        await axios.post(DISCORD_WEBHOOK_URL, { content: "🔔 Ping test from Render: Webhook is working!" });
        res.send("✅ Ping sent instantly to Discord.");
    } catch (error) {
        if (error.response?.status === 429) {
            const retryAfter = (error.response.headers["retry-after"] || 10);
            return res.status(429).send(`🚫 Rate limited. Try again after ${retryAfter} seconds.`);
        } else {
            console.error("❌ Failed to send ping:", error.message);
            return res.status(500).send("❌ Failed to send ping to Discord.");
        }
    }
});

// ✅ Root route
app.get("/", (req, res) => {
    res.send("🚀 Server running. Use /clip or /ping to test.");
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server live on port ${PORT}`));
