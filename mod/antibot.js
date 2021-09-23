module.exports = async (client) => {
  const typings = {};
  let allowBypass = true;
  let bypassUsed = [];
  setTimeout(() => {
    allowBypass = false;
    bypassUsed = [];
  }, 60000);
  client.on("typingStart", async (typing) => {
    if (!typings[typing.user.id]) typings[typing.user.id] = [];
    typings[typing.user.id].push({
      channel: typing.channel.id,
      startedAt: typing.startedAt,
      startedTimestamp: typing.startedTimestamp,
    });
  });
  client.on("messageCreate", async (msg) => {
    if (
      msg.member &&
      !msg.member.bot &&
      !msg.attachments.size &&
      !msg.stickers.size &&
      !msg.activity &&
      (await client.enableAntibot.get(msg.guild.id))
    ) {
      if (msg.embeds && msg.embeds.any((e) => e.type == "rich"))
        return msg.delete();
      if (msg.nonce === null) return msg.delete();
      if (
        (!allowBypass || bypassUsed.indexOf(msg.author.id) >= 0) &&
        (!typings[msg.member.id] ||
          !typings[msg.member.id].some((t) => t.channel == msg.channel.id))
      )
        return msg.delete();
      if (allowBypass) bypassUsed.push(msg.member.id);
      typings[msg.member.id] = typings[msg.member.id].filter(
        (t) => t.channel != msg.channel.id
      );
    }
  });
};
