const express = require("express");
const axios = require("axios");
const cors = require("cors"); // ✅ Enable CORS for external requests
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors()); // ✅ Allow all origins to access the API

const DISCORD_WEBHOOK_URL = process.env.WEBHOOK_URL;
const YOUTUBE_VIDEO_ID = process.env.YOUTUBE_VIDEO_ID;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const COOLDOWN_TIME = 30 * 1000; // 30-second cooldown
let cooldowns = {}; // Stores cooldown timestamps per user

// ✅ Function to get stream start time from YouTube API
async function getStreamStartTime() {
    try {
        const response = await axios.get(
            `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${YOUTUBE_VIDEO_ID}&key=${YOUTUBE_API_KEY}`
        );

        const streamDetails = response.data.items[0]?.liveStreamingDetails;
        if (!streamDetails || !streamDetails.actualStartTime) {
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
        const now = Math.floor(Date.now() / 1000); // Current time in seconds

        // ✅ Cooldown Check: Prevents spam
        if (cooldowns[user] && now - cooldowns[user] < COOLDOWN_TIME / 1000) {
            const timeLeft = Math.ceil(COOLDOWN_TIME / 1000 - (now - cooldowns[user]));
            return res.status(429).json({ error: `⚠️ Too many requests! Try again in ${timeLeft} seconds.` });
        }

        cooldowns[user] = now; // Update cooldown timestamp

        // ✅ Fetch stream start time dynamically
        const streamStartTime = await getStreamStartTime();
        if (!streamStartTime) {
            return res.status(500).json({ error: "❌ Failed to retrieve stream start time!" });
        }

        // ✅ Calculate timestamp (40 seconds delay)
        const timestamp = Math.max(now - streamStartTime - 150, 0);
        const clipUrl = `https://youtu.be/${YOUTUBE_VIDEO_ID}?t=${timestamp}`;

        // ✅ Message to Send to Discord
        const discordMessage = {
            content: `🎬 **New Clip from ${user}!**\n📢 Message: "${message}"\n🔗 [Watch Clip](${clipUrl})`
        };

        // ✅ Send to Discord Webhook
        await axios.post(DISCORD_WEBHOOK_URL, discordMessage);

        res.json({ success: "✅ Clip sent via webhook!", clipUrl });
    } catch (error) {
        console.error("❌ Server error:", error.message);
        res.status(500).json({ error: "❌ Internal server error." });
    }
});
app.get("/test-webhook", async (req, res) => {
    try {
        const response = await axios.post(DISCORD_WEBHOOK_URL, {
            content: "✅ Manual test message from /test-webhook route on Render."
        });
        res.send("✅ Test webhook message sent!");
    } catch (err) {
        console.error("Webhook test failed:", err.message);
        res.status(500).send("❌ Webhook test failed.");
    }
});

// ✅ Default Route
app.get("/", (req, res) => {
    res.send("🚀 Server is running! Use /clip to send a clip.");
});

// ✅ Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server running on port ${PORT}`));
