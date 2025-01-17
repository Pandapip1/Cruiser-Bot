const getUrls = require("get-urls");
const wget = require("node-wget-promise");
const path = require("path");
const util = require("util");
const axios = require("axios");
const nvt = require("node-virustotal");
const fs = require("fs");

module.exports = async (client) => {
  client.on("messageCreate", async (msg) => {
    if (msg.author.id == client.user.id) return;
    var reaction = null;
    var urls = null;
    var attachments = null;
    var channel = msg.channel;
    var issus = false;
    var author = msg.author;
    let logChannel = await client.channels
      .fetch(await client.antiScamLogChannel.get(msg.guild.id))
      .catch((e) => {
        return null;
      });
    if (
      msg.guild &&
      ((await client.virustotalApikeys.get(msg.guild.id)) ||
        (await client.ipqsApikeys.get(msg.guild.id)))
    ) {
      urls = Array.from(getUrls(msg.content));
      attachments = [];
      await Promise.all(
        msg.attachments.map(async (attachment) => {
          if (
            attachment &&
            attachment.proxyURL &&
            (!attachment.contentType ||
              (!attachment.contentType.startsWith("image") &&
                !attachment.contentType.startsWith("audio") &&
                !attachment.contentType.startsWith("video")))
          ) {
            if (!fs.existsSync("/tmp/cruiser/scan")) {
              fs.mkdirSync("/tmp/cruiser/scan", { recursive: true });
            }
            var attpath = path.resolve("/tmp/cruiser/scan", attachment.name);
            await wget(attachment.url, {
              output: attpath,
              onStart: console.log,
              onProgress: console.log,
            });
            attachments.push({
              filename: attpath,
              mimetype: attachment.contentType,
            });
          }
        })
      );
      if (msg.deleted) return;
      if (urls.length || attachments.length) {
        reaction = await msg
          .react("<a:analyzing:884596286039396432>")
          .catch(() => null);
      }
    }
    if (msg.guild && (await client.ipqsApikeys.get(msg.guild.id))) {
      await Promise.all(
        urls.map(async (url) => {
          let ipqsRes = (
            await axios({
              method: "GET",
              url: `https://ipqualityscore.com/api/json/url/${await client.ipqsApikeys.get(
                msg.guild.id
              )}/${encodeURIComponent(url)}`,
            })
          ).data;
          if (!ipqsRes.success) {
            if (!msg.deleted) {
              await msg.reply(
                `<:warning:881629456039571537> Warning for message sent by <@!${author.id}>: IPQS Failed to scan URL:\n${ipqsRes.message}`
              );
            } else {
              await channel.send(
                `<:warning:881629456039571537> Warning for message sent by <@!${author.id}>: IPQS Failed to scan URL:\n${ipqsRes.message}`
              );
            }
            await logChannel.send(
              `<:warning:881629456039571537> Warning for message sent by <@!${author.id}> in <#${msg.channel.id}>: IPQS Failed to scan URL:\n${ipqsRes.message}`
            );
            return;
          }
          if (ipqsRes.unsafe) {
            await channel.send(
              `<:bad:881629455964061717> URL sent by user <@!${author.id}> is unsafe/malicious (${ipqsRes.category})`
            );
            if (!msg.deleted) {
              msg.delete();
            }
            await logChannel.send(
              `<:bad:881629455964061717> URL sent by user <@!${author.id}> in <#${msg.channel.id}> is unsafe/malicious (${ipqsRes.category})`
            );
            issus = true;
          }
        })
      );
    }
    if (
      !msg.deleted &&
      msg.guild &&
      (await client.virustotalApikeys.get(msg.guild.id))
    ) {
      const defaultTimedInstance = nvt.makeAPI();
      defaultTimedInstance.setKey(
        await client.virustotalApikeys.get(msg.guild.id)
      );
      await Promise.all([
        Promise.all(
          urls.map(async (url) => {
            const analysisraw = await util.promisify(
              defaultTimedInstance.initialScanURL
            )(url);
            const analysis = JSON.parse(analysisraw).data.id;
            const scanraw = await util.promisify(
              defaultTimedInstance.getAnalysisInfo
            )(analysis);
            const scan = JSON.parse(scanraw).data.attributes.stats;
            const scanlink =
              "https://www.virustotal.com/gui/url/" +
              analysis.substring(
                analysis.indexOf("-") + 1,
                analysis.lastIndexOf("-")
              );
            if (scan.malicious && scan.malicious > 2) {
              await channel.send(
                "<:bad:881629455964061717> URL sent by user <@!" +
                  msg.author.id +
                  "> is unsafe/malicious:\n" +
                  scanlink
              );
              await logChannel.send(
                "<:bad:881629455964061717> URL sent by user <@!" +
                  msg.author.id +
                  "> in <#" +
                  msg.channel.id +
                  "> is unsafe/malicious:\n" +
                  scanlink
              );
              if (!msg.deleted) {
                await msg.delete();
              }
              issus = true;
            } else if (
              (scan.malicious && scan.malicious > 1) ||
              (scan.malicious &&
                scan.suspicious &&
                scan.malicious + scan.suspicious > 2) ||
              (scan.suspicious && scan.suspicious > 2)
            ) {
              if (msg.deleted) {
                await channel.send(
                  "<:warning:881629456039571537> URL sent by user <@!" +
                    msg.author.id +
                    "> is suspicious:\n" +
                    scanlink
                );
              } else {
                await msg.reply(
                  "<:warning:881629456039571537> URL sent by user <@!" +
                    msg.author.id +
                    "> is suspicious:\n" +
                    scanlink
                );
              }
              await logChannel.send(
                "<:warning:881629456039571537> URL sent by user <@!" +
                  msg.author.id +
                  "> in <#" +
                  msg.channel.id +
                  "> is suspicious:\n" +
                  scanlink
              );
              issus = true;
            }
          })
        ),
        Promise.all(
          attachments.map(async (attachment) => {
            const fileraw = await util.promisify(
              defaultTimedInstance.uploadFile
            )(attachment.filename, attachment.mimetype);
            const analysis = nvt.sha256(
              await util.promisify(fs.readFile)(attachment.filename)
            );
            const scanlink = "https://www.virustotal.com/gui/file/" + analysis;
            const scanraw = await util.promisify(
              defaultTimedInstance.fileLookup
            )(analysis);
            const scan =
              JSON.parse(scanraw).data.attributes.last_analysis_stats;
            if (scan.malicious) {
              await channel.send(
                "<:bad:881629455964061717> Attachment sent by user <@!" +
                  msg.author.id +
                  "> is unsafe/malicious:\n" +
                  scanlink
              );
              await logChannel.send(
                "<:bad:881629455964061717> Attachment sent by user <@!" +
                  msg.author.id +
                  "> in <#" +
                  msg.channel.id +
                  "> is unsafe/malicious:\n" +
                  scanlink
              );
              if (!msg.deleted) {
                await msg.delete();
              }
              issus = true;
            } else if (scan.suspicious) {
              if (msg.deleted) {
                await channel.send(
                  "<:warning:881629456039571537> Attachment sent by user <@!" +
                    msg.author.id +
                    "> is suspicious:\n" +
                    scanlink
                );
              } else {
                await msg.reply(
                  "<:warning:881629456039571537> Attachment sent by user <@!" +
                    msg.author.id +
                    "> is suspicious:\n" +
                    scanlink
                );
              }
              await logChannel.send(
                "<:warning:881629456039571537> Attachment sent by user <@!" +
                  msg.author.id +
                  "> in <#" +
                  msg.channel.id +
                  "> is suspicious:\n" +
                  scanlink
              );
              issus = true;
            }
          })
        ),
      ]);
    }
    if (reaction && !msg.deleted) {
      if (!issus) {
        msg.react("<:good:881629715419516958>");
      }
      reaction.remove();
    }
  });
};
