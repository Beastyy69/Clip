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
const COOLDOWN_TIME = 30 * 1000; // 30 seconds

let cooldowns = {}; // Per user
let lastPingTime = 0; // Global cooldown for /ping
const PING_COOLDOWN = 15000; // 15 seconds

// ✅ Function to get stream start time from YouTube API
async function getStreamStartTime() {
    try {
        const response = await axios.get(
            `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${YOUTUBE_VIDEO_ID}&key=${YOUTUBE_API_KEY}`
        );
        const streamDetails = response.data.items[0]?.liveStreamingDetails;
        if (!streamDetails?.actualStartTime) {
            console.error("❌ Could not retrieve stream start time!");
            return null;
        }
        return Math.floor(new Date(streamDetails.actualStartTime).getTime() / 1000);
    } catch (error) {
        console.error("❌ Error fetching stream start time:", error.message);
        return null;
    }
}

// ✅ Route to Handle Clip Requests
app.get("/clip", async (req, res) => {
    try {
        const user = req.query.user || "Unknown User";
        const message = req.query.message || "No message provided.";
        const now = Math.floor(Date.now() / 1000);

        if (!DISCORD_WEBHOOK_URL) {
            return res.status(500).json({ error: "❌ Webhook URL not set." });
        }

        // Cooldown per user
        if (cooldowns[user] && now - cooldowns[user] < COOLDOWN_TIME / 1000) {
            const timeLeft = Math.ceil(COOLDOWN_TIME / 1000 - (now - cooldowns[user]));
            return res.status(429).json({ error: `⚠️ Too many requests! Try again in ${timeLeft} seconds.` });
        }

        cooldowns[user] = now;

        const streamStartTime = await getStreamStartTime();
        if (!streamStartTime) {
            return res.status(500).json({ error: "❌ Failed to retrieve stream start time!" });
        }

        const timestamp = Math.max(now - streamStartTime - 150, 0);
        const clipUrl = `https://youtu.be/${YOUTUBE_VIDEO_ID}?t=${timestamp}`;

        const discordMessage = {
            content: `🎬 **New Clip from ${user}!**\n📢 Message: "${message}"\n🔗 [Watch Clip](${clipUrl})`
        };

        const response = await axios.post(DISCORD_WEBHOOK_URL, discordMessage);
        res.json({ success: "✅ Clip sent via webhook!", clipUrl });
    } catch (error) {
        if (error.response?.status === 429) {
            const retryAfter = error.response.headers["retry-after"] || "unknown";
            console.error(`🚫 Rate limited. Retry after ${retryAfter} seconds.`);
            return res.status(429).json({ error: `🚫 Discord rate limit hit. Retry after ${retryAfter} seconds.` });
        }
        console.error("❌ Server error:", error.message);
        res.status(500).json({ error: "❌ Internal server error." });
    }
});

// ✅ Ping Webhook Route
app.get("/ping", async (req, res) => {
    const now = Date.now();
    if (now - lastPingTime < PING_COOLDOWN) {
        const waitTime = Math.ceil((PING_COOLDOWN - (now - lastPingTime)) / 1000);
        return res.status(429).send(`⚠️ Slow down. Wait ${waitTime}s before next ping.`);
    }

    if (!DISCORD_WEBHOOK_URL) {
        return res.status(500).send("❌ Webhook URL not configured.");
    }

    lastPingTime = now;

    try {
        const response = await axios.post(DISCORD_WEBHOOK_URL, {
            content: "🔔 Ping test from Render: Webhook is working!"
        });
        res.send("✅ Ping sent to Discord!");
    } catch (error) {
        if (error.response?.status === 429) {
            const retryAfter = error.response.headers["retry-after"] || "unknown";
            console.error(`🚫 Rate limited. Retry after ${retryAfter} seconds.`);
            return res.status(429).send(`🚫 Rate limited. Retry after ${retryAfter} seconds.`);
        }
        console.error("❌ Ping test failed:", error.message);
        res.status(500).send("❌ Failed to send ping to Discord.");
    }
});

// ✅ Default Route
app.get("/", (req, res) => {
    res.send("🚀 Server is running! Use /clip or /ping");
});

// ✅ Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server running on port ${PORT}`));
