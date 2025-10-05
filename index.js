import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import cron from "node-cron";
import express from "express";
import fs from "fs";

// ===== CONFIG =====
const TOKEN = process.env.TOKEN; // Get token from Replit Secrets
const DATA_FILE = "./balances.json";
const SETTINGS_FILE = "./settings.json";

// ===== DATABASES =====
let balances = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE)) : {};
let settings = fs.existsSync(SETTINGS_FILE)
  ? JSON.parse(fs.readFileSync(SETTINGS_FILE))
  : { automod: true, chatRewards: true, dailyDiscount: true, welcomeDM: true, currency: "Geo" };
let discountActive = false;

// ===== UTIL =====
const saveBalances = () => fs.writeFileSync(DATA_FILE, JSON.stringify(balances, null, 2));
const saveSettings = () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
const stylish = text => `╭━━━ ${text.toUpperCase()} ━━━╮`;
const geo = id => balances[id] || 0;
const addGeo = (id, amt) => { balances[id] = geo(id) + amt; saveBalances(); };

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: ["CHANNEL"]
});

// ===== READY =====
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity("💎 Diamond Hub 💎", { type: 3 });
});

// ===== WELCOME DM =====
client.on("guildMemberAdd", async member => {
  if (!settings.welcomeDM) return;
  try {
    const embed = new EmbedBuilder()
      .setTitle("╭────── ✦ WELCOME TO DIAMOND HUB ✦ ──────╮")
      .setDescription([
        `> 👋 Hello **${member.user.username}**!`,
        `> Welcome to the **Diamond Hub Community**.`,
        `> Earn **${settings.currency}** by chatting and events.`,
        `> Use \`!shop\` to view premium perks.`,
        ``,
        `> ✨ _Powered by JavaScript_`,
        `> ❤️ _Made with love by Kiro_`
      ].join("\n"))
      .setColor("Aqua");
    await member.send({ embeds: [embed] });
  } catch { console.log(`⚠️ Could not DM ${member.user.tag}`); }
});

// ===== AUTO MOD & CHAT REWARDS =====
client.on("messageCreate", msg => {
  if (msg.author.bot) return;

  // Chat rewards
  if (settings.chatRewards) addGeo(msg.author.id, Math.floor(Math.random()*3));

  // Automod
  if (settings.automod) {
    const badWords = ["nigga","nigger","Job"]; // Add more yourself
    if (badWords.some(w => msg.content.toLowerCase().includes(w))) {
      msg.delete().catch(() => {});
      msg.channel.send(`> ⚠️ ${msg.author}, please avoid inappropriate terms.`);
    }
  }
});

// ===== COMMANDS =====
client.on("messageCreate", async msg => {
  if (!msg.content.startsWith("!")) return;
  const args = msg.content.slice(1).split(" ");
  const cmd = args.shift().toLowerCase();

  // BALANCE
  if (cmd==="balance"){
    const embed = new EmbedBuilder()
      .setColor("Gold")
      .setTitle("💰 Your Balance")
      .setDescription(`> You currently have **${geo(msg.author.id)} ${settings.currency}**`);
    msg.reply({ embeds: [embed] });
  }

  // SHOP
  if (cmd==="shop"){
    const prices = {
      "Premium 10 Days": 200,
      "Premium 1 Month": 1200,
      "Premium 1 Year": 10000,
      "Premium Permanent": 20000
    };
    const embed = new EmbedBuilder()
      .setColor("Aqua")
      .setTitle("🏪 Diamond Hub Shop")
      .setDescription(Object.entries(prices)
        .map(([n,p])=>`> **${n}** — ${discountActive ? p/2 : p} ${settings.currency}`)
        .join("\n"))
      .setFooter({text:"Type !buy <item name> to purchase."});
    msg.reply({embeds:[embed]});
  }

  // BUY
  if (cmd==="buy"){
    const item = args.join(" ").toLowerCase();
    const items = {"premium 10 days":200,"premium 1 month":1200,"premium 1 year":10000,"premium permanent":20000};
    const key = Object.keys(items).find(k=>k===item);
    if (!key) return msg.reply("> ❌ Item not found.");
    const cost = discountActive ? items[key]/2 : items[key];
    if (geo(msg.author.id)<cost) return msg.reply("> ❌ Not enough "+settings.currency+"!");
    addGeo(msg.author.id,-cost);
    msg.reply(`> ✅ You bought **${key}** for **${cost} ${settings.currency}**!`);
  }

  // SETTINGS (admin)
  if (cmd==="settings" && msg.member.permissions.has("Administrator")){
    if(!args[0]){
      const embed = new EmbedBuilder()
        .setColor("Purple")
        .setTitle("⚙️ Bot Settings")
        .setDescription(Object.entries(settings).map(([k,v])=>`> **${k}**: ${v?"🟢 Enabled":"🔴 Disabled"}`).join("\n"))
        .setFooter({text:"Use !settings <feature> to toggle"});
      msg.reply({embeds:[embed]});
    } else {
      const key = args[0].toLowerCase();
      if(!settings.hasOwnProperty(key)) return msg.reply("> ❌ Invalid setting name!");
      settings[key] = !settings[key];
      saveSettings();
      msg.reply(`> ⚙️ Setting **${key}** is now **${settings[key]?"🟢 Enabled":"🔴 Disabled"}**`);
    }
  }

  // SAY (admin)
  if(cmd==="say" && msg.member.permissions.has("Administrator")){
    const content = msg.content.slice(4).trim();
    const parts = content.split("|").map(p=>p.trim()).filter(Boolean);
    const mainText = parts[0];
    const opts = parts.slice(1,6);
    if(!mainText) return msg.reply("> Usage: `!say <message> | <option 1> ...`");

    const embed = new EmbedBuilder()
      .setColor("Blurple")
      .setTitle("💎 Diamond Hub Announcement 💎")
      .setDescription(`> ${mainText}`);
    if(opts.length) embed.addFields(opts.map((o,i)=>({name:`Option ${i+1}`,value:`> ${o}`,inline:false})));
    embed.setFooter({text:"Powered by JavaScript • Made with love by Kiro"});
    msg.channel.send({embeds:[embed]});
  }
});

// ===== DAILY DISCOUNT =====
if(settings.dailyDiscount){
  cron.schedule("0 0 * * *", ()=>{
    discountActive = true;
    console.log("🎉 Daily discount started!");
    setTimeout(()=>{discountActive=false;console.log("🕒 Discount ended.")},30*60*1000);
  });
}

// ===== WEB SERVER FOR UPTIME =====
const app = express();
const PORT = 3000;
app.get("/",(req,res)=>res.send("💎 Diamond Hub Bot is online! 💎"));
app.listen(PORT,()=>console.log(`Web server running on port ${PORT}`));

// ===== LOGIN =====
client.login(TOKEN);
