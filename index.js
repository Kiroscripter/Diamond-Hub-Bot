import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import cron from "node-cron";
import express from "express";
import fs from "fs";

// ===== CONFIG =====
const TOKEN = process.env.TOKEN; // Get token from Replit Secrets
const DATA_FILE = "./balances.json";
const SETTINGS_FILE = "./settings.json";
const WARNINGS_FILE = "./warnings.json";

// ===== DATABASES =====
let balances = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE)) : {};
let settings = fs.existsSync(SETTINGS_FILE)
  ? JSON.parse(fs.readFileSync(SETTINGS_FILE))
  : { automod: true, chatRewards: true, dailyDiscount: true, welcomeDM: true, currency: "Geo" };
let warnings = fs.existsSync(WARNINGS_FILE) ? JSON.parse(fs.readFileSync(WARNINGS_FILE)) : {};
let discountActive = false;

// ===== UTIL =====
const saveBalances = () => fs.writeFileSync(DATA_FILE, JSON.stringify(balances, null, 2));
const saveSettings = () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
const saveWarnings = () => fs.writeFileSync(WARNINGS_FILE, JSON.stringify(warnings, null, 2));
const stylish = text => `╭━━━ ${text.toUpperCase()} ━━━╮`;
const geo = id => balances[id] || 0;
const addGeo = (id, amt) => { balances[id] = geo(id) + amt; saveBalances(); };
const getWarnings = id => {
  if (!warnings[id]) return [];
  const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  return warnings[id].filter(w => new Date(w.date).getTime() > oneMonthAgo);
};
const addWarning = (id, amount, reason, by) => {
  if (!warnings[id]) warnings[id] = [];
  warnings[id].push({ amount, reason, by, date: new Date().toISOString() });
  saveWarnings();
};
const removeWarning = (id, index) => {
  if (!warnings[id] || !warnings[id][index]) return false;
  warnings[id].splice(index, 1);
  if (warnings[id].length === 0) delete warnings[id];
  saveWarnings();
  return true;
};
const applyPunishment = async (member, totalWarns) => {
  if (totalWarns === 3) {
    await member.timeout(4 * 60 * 60 * 1000, "3 warnings reached");
    return "4 hours mute";
  } else if (totalWarns === 4) {
    await member.timeout(24 * 60 * 60 * 1000, "4 warnings reached");
    return "1 day mute";
  } else if (totalWarns === 5) {
    await member.timeout(3 * 24 * 60 * 60 * 1000, "5 warnings reached");
    return "3 days mute";
  } else if (totalWarns === 6) {
    await member.timeout(7 * 24 * 60 * 60 * 1000, "6 warnings reached");
    return "1 week mute";
  } else if (totalWarns >= 7) {
    await member.ban({ reason: "7 warnings reached" });
    return "banned";
  }
  return null;
};

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

  // Bot ping response
  if (msg.mentions.has(client.user)) {
    const embed = new EmbedBuilder()
      .setColor("Green")
      .setTitle("💎 Diamond Hub Bot 💎")
      .setDescription([
        `> ✅ **I'm online and ready!**`,
        `> 🟢 Status: **Active**`,
        `> ⚡ Response time: **${client.ws.ping}ms**`,
        ``,
        `> Use \`!shop\` to view the shop`,
        `> Use \`!balance\` to check your balance`
      ].join("\n"))
      .setFooter({text:"💎 Diamond Hub - Always Online"});
    msg.reply({ embeds: [embed] });
    return;
  }

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

  // ===== GIVE GEO =====
  if(cmd === "givegeo"){
    const target = msg.mentions.users.first();
    if(!target) return msg.reply("> ❌ You need to mention a user to give Geo!");
    if(target.id === msg.author.id) return msg.reply("> ❌ You cannot give Geo to yourself!");
    if(target.bot) return msg.reply("> ❌ You cannot give Geo to bots!");

    const amount = parseInt(args[1]);
    if(isNaN(amount) || amount < 1) return msg.reply("> ❌ Please enter a valid amount to give!");
    if(geo(msg.author.id) < amount) return msg.reply("> ❌ You don't have enough " + settings.currency + "!");

    // Subtract from sender and add to receiver
    addGeo(msg.author.id, -amount);
    addGeo(target.id, amount);

    const embed = new EmbedBuilder()
      .setTitle("💸 Geo Sent!")
      .setDescription(`> **${msg.author.tag}** gave **${amount} ${settings.currency}** to **${target.tag}**!`)
      .setColor("Gold");

    msg.reply({ embeds: [embed] });
  }

  // GIVE GEO INFINITE (admin)
  if(cmd === "givegeoinf" && msg.member.permissions.has("Administrator")){
    const target = msg.mentions.users.first();
    if(!target) return msg.reply("> ❌ You need to mention a user to give Geo!");

    const amount = parseInt(args[1]);
    if(isNaN(amount) || amount < 1) return msg.reply("> ❌ Please enter a valid amount!");

    addGeo(target.id, amount);

    const embed = new EmbedBuilder()
      .setTitle("💸 Geo Given!")
      .setDescription(`> **${target.tag}** received **${amount} ${settings.currency}** (infinite admin command)!`)
      .setColor("Gold");

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

  // WARN (admin)
  if(cmd==="warn" && msg.member.permissions.has("Administrator")){
    const user = msg.mentions.users.first();
    if(!user) return msg.reply("> Usage: `!warn @user : <amount> ; <reason>`");
    
    const content = msg.content.slice(6).trim();
    const parts = content.split(":");
    if(parts.length < 2) return msg.reply("> ❌ Please use format: `!warn @user : <amount> ; <reason>`");
    
    const afterColon = parts[1].trim();
    const [amountStr, ...reasonParts] = afterColon.split(";");
    const amount = parseInt(amountStr.trim());
    const reason = reasonParts.join(";").trim() || "No reason provided";
    
    if(isNaN(amount) || amount < 1) return msg.reply("> ❌ Amount must be a valid number!");
    
    addWarning(user.id, amount, reason, msg.author.tag);
    
    const totalWarns = getWarnings(user.id).reduce((sum, w) => sum + w.amount, 0);
    
    const member = await msg.guild.members.fetch(user.id);
    const punishment = await applyPunishment(member, totalWarns);
    
    const embed = new EmbedBuilder()
      .setColor("Red")
      .setTitle("⚠️ User Warned")
      .setDescription([
        `> **User**: ${user}`,
        `> **Warnings Added**: ${amount}`,
        `> **Total Warnings**: ${totalWarns}`,
        `> **Reason**: ${reason}`,
        `> **Warned by**: ${msg.author.tag}`,
        punishment ? `> **Punishment**: ${punishment}` : ""
      ].filter(Boolean).join("\n"))
      .setFooter({text:"Diamond Hub Moderation System • Warnings expire after 30 days"});
    msg.reply({embeds:[embed]});
  }

  // REMOVEWARN (admin)
  if(cmd==="removewarn" && msg.member.permissions.has("Administrator")){
    const user = msg.mentions.users.first();
    if(!user) return msg.reply("> Usage: `!removewarn @user <warning number>`");
    
    const warnIndex = parseInt(args[1]) - 1;
    if(isNaN(warnIndex) || warnIndex < 0) return msg.reply("> ❌ Please provide a valid warning number!");
    
    const userWarnings = getWarnings(user.id);
    if(!userWarnings[warnIndex]) return msg.reply("> ❌ Warning not found!");
    
    const removed = userWarnings[warnIndex];
    if(removeWarning(user.id, warnIndex)){
      const newTotal = getWarnings(user.id).reduce((sum, w) => sum + w.amount, 0);
      msg.reply(`> ✅ Removed warning ${warnIndex + 1} from ${user.tag}\n> **Reason was**: ${removed.reason}\n> **New total**: ${newTotal} warnings`);
    } else {
      msg.reply("> ❌ Failed to remove warning!");
    }
  }

  // WARNINGS (check warnings)
  if(cmd==="warnings"){
    const user = msg.mentions.users.first() || msg.author;
    const userWarnings = getWarnings(user.id);
    const totalWarns = userWarnings.reduce((sum, w) => sum + w.amount, 0);
    
    if(userWarnings.length === 0){
      return msg.reply(`> ✅ ${user.tag} has no warnings!`);
    }
    
    const embed = new EmbedBuilder()
      .setColor("Orange")
      .setTitle(`⚠️ Warnings for ${user.tag}`)
      .setDescription(`> **Total Warnings**: ${totalWarns}\n> **Warning Count**: ${userWarnings.length}`)
      .addFields(userWarnings.slice(-5).reverse().map((w, i) => ({
        name: `Warning ${userWarnings.length - i}`,
        value: `> Amount: ${w.amount}\n> Reason: ${w.reason}\n> By: ${w.by}\n> Date: ${new Date(w.date).toLocaleDateString()}`,
        inline: false
      })))
      .setFooter({text: userWarnings.length > 5 ? "Showing last 5 warnings" : "All warnings shown"});
    msg.reply({embeds:[embed]});
  }

  // BAN (admin)
  if(cmd==="ban" && msg.member.permissions.has("BanMembers")){
    const user = msg.mentions.users.first();
    if(!user) return msg.reply("> Usage: `!ban @user [reason]`");
    const reason = args.slice(1).join(" ") || "No reason provided";
    try {
      const member = await msg.guild.members.fetch(user.id);
      await member.ban({ reason: reason });
      msg.reply(`> 🔨 **${user.tag}** has been banned.\n> **Reason**: ${reason}`);
    } catch(e) {
      msg.reply(`> ❌ Failed to ban user: ${e.message}`);
    }
  }

  // UNBAN (admin)
  if(cmd==="unban" && msg.member.permissions.has("BanMembers")){
    const userId = args[0];
    if(!userId) return msg.reply("> Usage: `!unban <user_id>`");
    try {
      await msg.guild.members.unban(userId);
      msg.reply(`> ✅ User **${userId}** has been unbanned.`);
    } catch(e) {
      msg.reply(`> ❌ Failed to unban: ${e.message}`);
    }
  }

  // KICK (admin)
  if(cmd==="kick" && msg.member.permissions.has("KickMembers")){
    const user = msg.mentions.users.first();
    if(!user) return msg.reply("> Usage: `!kick @user [reason]`");
    const reason = args.slice(1).join(" ") || "No reason provided";
    try {
      const member = await msg.guild.members.fetch(user.id);
      await member.kick(reason);
      msg.reply(`> 👢 **${user.tag}** has been kicked.\n> **Reason**: ${reason}`);
    } catch(e) {
      msg.reply(`> ❌ Failed to kick user: ${e.message}`);
    }
  }

  // MUTE (admin)
  if(cmd==="mute" && msg.member.permissions.has("ModerateMembers")){
    const user = msg.mentions.users.first();
    if(!user || !args[1]) return msg.reply("> Usage: `!mute @user <duration> [reason]`\n> Duration: 1m, 1h, 1d, etc.");
    
    const durationStr = args[1].toLowerCase();
    const reason = args.slice(2).join(" ") || "No reason provided";
    
    const timeMatch = durationStr.match(/^(\d+)([smhd])$/);
    if(!timeMatch) return msg.reply("> ❌ Invalid duration! Use: 1m, 1h, 1d");
    
    const [, num, unit] = timeMatch;
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const duration = parseInt(num) * multipliers[unit];
    
    try {
      const member = await msg.guild.members.fetch(user.id);
      await member.timeout(duration, reason);
      msg.reply(`> 🔇 **${user.tag}** has been muted for **${durationStr}**.\n> **Reason**: ${reason}`);
    } catch(e) {
      msg.reply(`> ❌ Failed to mute user: ${e.message}`);
    }
  }

  // UNMUTE (admin)
  if(cmd==="unmute" && msg.member.permissions.has("ModerateMembers")){
    const user = msg.mentions.users.first();
    if(!user) return msg.reply("> Usage: `!unmute @user`");
    try {
      const member = await msg.guild.members.fetch(user.id);
      await member.timeout(null);
      msg.reply(`> 🔊 **${user.tag}** has been unmuted.`);
    } catch(e) {
      msg.reply(`> ❌ Failed to unmute user: ${e.message}`);
    }
  }

  // PURGE (admin)
  if(cmd==="purge" && msg.member.permissions.has("ManageMessages")){
    const amount = parseInt(args[0]);
    if(isNaN(amount) || amount < 1 || amount > 100) return msg.reply("> ❌ Please provide a number between 1-100");
    try {
      const deleted = await msg.channel.bulkDelete(amount + 1, true);
      const reply = await msg.channel.send(`> 🗑️ Deleted **${deleted.size - 1}** messages.`);
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    } catch(e) {
      msg.reply(`> ❌ Failed to purge messages: ${e.message}`);
    }
  }

  // LOCK (admin)
  if(cmd==="lock" && msg.member.permissions.has("ManageChannels")){
    try {
      await msg.channel.permissionOverwrites.edit(msg.guild.id, { SendMessages: false });
      msg.reply(`> 🔒 Channel locked. Only admins can send messages.`);
    } catch(e) {
      msg.reply(`> ❌ Failed to lock channel: ${e.message}`);
    }
  }

  // UNLOCK (admin)
  if(cmd==="unlock" && msg.member.permissions.has("ManageChannels")){
    try {
      await msg.channel.permissionOverwrites.edit(msg.guild.id, { SendMessages: null });
      msg.reply(`> 🔓 Channel unlocked.`);
    } catch(e) {
      msg.reply(`> ❌ Failed to unlock channel: ${e.message}`);
    }
  }

  // SLOWMODE (admin)
  if(cmd==="slowmode" && msg.member.permissions.has("ManageChannels")){
    const seconds = parseInt(args[0]);
    if(isNaN(seconds) || seconds < 0 || seconds > 21600) return msg.reply("> ❌ Slowmode must be between 0-21600 seconds (0 to disable)");
    try {
      await msg.channel.setRateLimitPerUser(seconds);
      msg.reply(seconds === 0 ? `> ⏱️ Slowmode disabled.` : `> ⏱️ Slowmode set to **${seconds} seconds**.`);
    } catch(e) {
      msg.reply(`> ❌ Failed to set slowmode: ${e.message}`);
    }
  }

  // NICKNAME (admin)
  if(cmd==="nickname" && msg.member.permissions.has("ManageNicknames")){
    const user = msg.mentions.members.first();
    if(!user) return msg.reply("> Usage: `!nickname @user <new name>`");
    const newNick = args.slice(1).join(" ");
    if(!newNick) return msg.reply("> ❌ Please provide a new nickname");
    try {
      await user.setNickname(newNick);
      msg.reply(`> ✏️ Changed **${user.user.tag}**'s nickname to **${newNick}**`);
    } catch(e) {
      msg.reply(`> ❌ Failed to change nickname: ${e.message}`);
    }
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
const PORT = 5000;
app.get("/",(req,res)=>res.send("💎 Diamond Hub Bot is online! 💎"));
app.listen(PORT, "0.0.0.0", ()=>console.log(`Web server running on port ${PORT}`));

// ===== LOGIN =====
client.login(TOKEN);
