const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ActivityType, REST, Routes, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, InteractionType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const fs = require('fs');
const config = require('./config.json');
const path = './embedCache.json';
const { Mutex } = require('async-mutex');
const messageMapMutex = new Mutex();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

let oeData = {};
let cacheMap = new Map();


function saveCacheToFile() {
    fs.writeFileSync(path, JSON.stringify(Array.from(cacheMap.entries())));
}

function loadCacheFromFile() {
    if (fs.existsSync(path)) {
        const data = fs.readFileSync(path, 'utf8');
        const entries = JSON.parse(data);
        cacheMap = new Map(entries);
    }
}
async function loadOeData() {
    try {
        const data = fs.readFileSync('oe-liste.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Fehler beim Laden der OE-Daten:', error);
        return {};
    }
}

loadOeData().then(data => oeData = data);

const rpcStatuses = {
    listening: [
        "was so im BOS Funkverkehr abgeht.",
        "den Gruppenführer beim Üben des Einsatzbefehls.",
        "den Funkverkehr der Landkreise.",
        "wie der Einsatzleiter die Lage analysiert.",
        "den Funkverkehr von der Leitstelle.",
        "den Betrieb der Einsatzfahrzeuge.",
        "den Lärm der Einsatzstellen.",
        "wie die Helfer ihre Aufgaben koordinieren.",
        "wie der Funkkontakt zur Führungsebene besteht.",
        "das Geplänkel beim Aufbau der Einsatzstelle."
    ],
    watching: [
        "ob die Helfer ihren Aufgaben nachkommen.",
        "das die Logistik bei der Verpflegung läuft.",
        "wie das Material auf der Einsatzstelle ankommt.",
        "auf das Setup der Geräte und Maschinen.",
        "ob alle Fahrzeuge bereitstehen.",
        "wie die Kommunikation im Team stattfindet.",
        "wie das Team die Einsatztechnik überprüft.",
        "auf den Stand der Technik in der Einsatzleitung.",
        "ob das Team effizient arbeitet.",
        "der Arbeit von den Teams vor Ort zu."
    ],
    playing: [
        "dem Gruppenführer einen Streich.",
        "eine Täuschung einer Nachricht von der Feuerwehr vor.",
        "Versteckt das Funkgerät des Zugführers.",
        "Tauscht die Wäsche der Helfer in den Spinden um.",
        "Schickt die Helfer auf eine falsche Spur.",
        "Hängt die Alarmierungen um.",
        "Versteckt die Einsatzdokumente.",
        "Verschiebt den Einsatzbefehl zur falschen Zeit.",
        "Ändert die Aufträge der Helfer.",
        "Schickt dem Gruppenführer einen mysteriösen Funkspruch."
    ]
};

function updateStatus() {
    const statusTypes = [ActivityType.Watching, ActivityType.Playing, ActivityType.Listening];
    const randomType = statusTypes[Math.floor(Math.random() * statusTypes.length)];
    const randomPhrase = getRandomPhrase(randomType);

    client.user.setActivity(randomPhrase, { type: randomType });
    setTimeout(updateStatus, 300000); // Update alle 5 Minuten
}

function getRandomPhrase(type) {
    switch (type) {
        case ActivityType.Listening:
            return rpcStatuses.listening[Math.floor(Math.random() * rpcStatuses.listening.length)];
        case ActivityType.Watching:
            return rpcStatuses.watching[Math.floor(Math.random() * rpcStatuses.watching.length)];
        case ActivityType.Playing:
            return rpcStatuses.playing[Math.floor(Math.random() * rpcStatuses.playing.length)];
        default:
            return "Verwalte die Aufgaben des THW!";
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    loadCacheFromFile()
    updateStatus();
});

const commands = [
    new SlashCommandBuilder().setName('send-gui').setDescription('Sende das GUI in einen bestimmten Kanal (Befehl Administratoren vorbehalten)').setDefaultMemberPermissions(BigInt(0x00000008))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Kanal auswählen')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Titel eingeben')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Nachricht eingeben')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('embedcolor')
                .setDescription('Bitte gib eine Embedfarbe ein')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('thumbnail_url')
                .setDescription('Bitte Thumbnail URL eingeben, wird bei leer auf NULL gesetzt')
                .setRequired(false)),
    new SlashCommandBuilder().setName('help').setDescription('Zeigt eine Liste aller Befehle'),
    new SlashCommandBuilder().setName('registercommands').setDescription('Registriere oder aktualisiere die Slash-Befehle (Befehl BotEntwickler vorbehalten)')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

async function registerCommands(interaction) {
    try {
        console.log('Registriere oder aktualisiere Slash-Commands...');
        const guilds = await client.guilds.fetch();
        for (const [guildId] of guilds) {
            const existingCommands = await rest.get(Routes.applicationGuildCommands(client.user.id, guildId));
            if (JSON.stringify(existingCommands) !== JSON.stringify(commands)) {
                await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
                console.log(`Befehle für Server ${guildId} aktualisiert.`);
            } else {
                console.log(`Befehle für Server ${guildId} sind bereits aktuell.`);
            }
        }
        await interaction.reply({ content: 'Befehle wurden erfolgreich registriert oder aktualisiert.', ephemeral: true });
    } catch (error) {
        console.error('Fehler beim Registrieren der Befehle:', error);
        await interaction.reply({ content: 'Fehler beim Registrieren der Befehle.', ephemeral: true });
    }
}

async function sendGui(interaction) {
    try {
        const channel = interaction.options.getChannel('channel');
        const title = interaction.options.getString('title');
        const message = interaction.options.getString('message');
        let embedcolor = interaction.options.getString('embedcolor') || '#00AE86';
        let thumbnailUrl = interaction.options.getString('thumbnail_url') || null;

        if (!channel || !title || !message) {
            await interaction.reply({ content: 'Ungültige Eingaben!', ephemeral: true });
            return;
        }

        if (embedcolor.startsWith('#')) {
            embedcolor = embedcolor.replace('#', '');
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(message)
            .setColor(embedcolor)
            .setThumbnail(thumbnailUrl)
            .setTimestamp();

        const uniqueOptions = Array.from(new Set(oeData.map(entry => entry["Landesverband/AZ"])))
            .slice(0, 25)
            .map(value => ({
                label: value || 'N/A',
                value: `lv_${value}`
            }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_lv')
            .setPlaceholder('Wähle deinen Landesverband')
            .addOptions(uniqueOptions);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const sentMessage = await channel.send({ embeds: [embed], components: [row] });
        console.log('GUI gesendet:', sentMessage.id);

        cacheMap.set(sentMessage.id, { channelId: channel.id, title, message, embedcolor, thumbnailUrl });
        saveCacheToFile();
        console.log('Cache gespeichert:', cacheMap);

        await interaction.reply({ content: 'GUI wurde gesendet.', ephemeral: true });
    } catch (error) {
        console.error('Fehler beim Senden der GUI:', error);
        await interaction.reply({ content: 'Fehler beim Senden der GUI.', ephemeral: true });
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu() && !interaction.isButton() && !interaction.isModalSubmit()) return;

    if (interaction.commandName === 'send-gui') {
        await sendGui(interaction);
    }

    if (interaction.commandName === 'registercommands') {
        if (interaction.user.id != config.ownerId) {
            await interaction.reply({ content: 'Du hast keine Berechtigung, Du bist nicht mein Entwickler >:( \n Ich akzeptiere diesen Befehl nur von <@407566758535495701>', ephemeral: true });
            return;
        }
        await registerCommands(interaction);
    }

    if (interaction.commandName === 'help') {
        const helpMessage = `
        **Liste der verfügbaren Befehle:**
        \`/send-gui\` - Sende das GUI in einen bestimmten Kanal (Befehl Administratoren vorbehalten)
        \`/help\` - Zeigt eine Liste aller Befehle
        \`/registercommands\` - Registriere oder aktualisiere die Slash-Befehle (Befehl BotEntwickler vorbehalten)
        `;
        await interaction.reply({ content: helpMessage, ephemeral: false });
    }

    if (interaction.isStringSelectMenu()) {
        const messageData = cacheMap.get(interaction.message.id);
        if (!messageData) {
            await interaction.reply({ content: 'Fehler: Nachricht nicht gefunden.', ephemeral: true });
            return;
        }

        if (interaction.customId === 'select_lv') {
            const selectedLv = interaction.values[0].replace('lv_', '');
            const rsOptions = oeData.filter(entry => entry["Landesverband/AZ"] === selectedLv)
                .map(entry => entry["Regionalstelle"]).filter((v, i, a) => a.indexOf(v) === i)
                .map(rs => ({ label: rs || 'N/A', value: `rs_${rs}` }));
            const rsSelectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_rs')
                .setPlaceholder('Wähle deine Regionalstelle')
                .addOptions(rsOptions);

            const row = new ActionRowBuilder().addComponents(rsSelectMenu);

            const message = await interaction.reply({
                content: `Du hast **${selectedLv}** gewählt. Nun wähle deine Regionalstelle:`,
                components: [row],
                ephemeral: true,
                fetchReply: true
            });

            cacheMap.set(message.id, { channelId: message.channel.id, messageId: message.id, selectedLv });
            saveCacheToFile();
        }

        if (interaction.customId === 'select_rs') {
            const selectedRs = interaction.values[0].replace('rs_', '');
            const ovOptions = oeData.filter(entry => entry["Regionalstelle"] === selectedRs)
                .map(entry => entry["Ortsverband"]).filter((v, i, a) => a.indexOf(v) === i)
                .map(ov => ({ label: ov || 'N/A', value: `ov_${ov}` }));
            const ovSelectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_ov')
                .setPlaceholder('Wähle deinen Ortsverband')
                .addOptions(ovOptions);

            const row = new ActionRowBuilder().addComponents(ovSelectMenu);

            await interaction.update({
                content: `Du hast **${selectedRs}** gewählt. Nun wähle deinen Ortsverband:`,
                components: [row],
                ephemeral: true
            });

            const messageData = cacheMap.get(interaction.message.id);
            messageData.selectedRs = selectedRs;
            cacheMap.set(interaction.message.id, messageData);
            saveCacheToFile();
        }

        if (interaction.customId === 'select_ov') {
            const selectedOv = interaction.values[0].replace('ov_', '');
            const teileinheiten = [
                "I", "R-A", "R-B", "R-C", "W-A", "W-B", "O-A", "O-B", "O-C",
                "E", "WP-A", "WP-B", "WP-C", "N", "SB-A", "SB-B", "Log-MW", "Log-V",
                "F", "K-A", "K-B", "TW", "Öl-A", "Öl-B", "Öl-C", "BT", "BrB",
                "Sp", "MT", "ENT", "ESS", "MHP", "UL", "TS", "SEEBA", "SEEWA", "SEELift",
                "SEC", "HCP", "TAST", "ETS", "ZTr", "B-A", "B-E", "Stab", "ZTr Log", "ZTr FK"
            ];

            const teOptions1 = teileinheiten.slice(0, 25).map(te => ({ label: te || 'N/A', value: `te_${te}` }));
            const teOptions2 = teileinheiten.slice(25).map(te => ({ label: te || 'N/A', value: `te_${te}` }));

            const teSelectMenu1 = new StringSelectMenuBuilder()
                .setCustomId('select_te_1')
                .setPlaceholder('Wähle deine Teileinheit (1-25)')
                .addOptions(teOptions1);

            const teSelectMenu2 = new StringSelectMenuBuilder()
                .setCustomId('select_te_2')
                .setPlaceholder('Wähle deine Teileinheit (26-47)')
                .addOptions(teOptions2);

            const row1 = new ActionRowBuilder().addComponents(teSelectMenu1);
            const row2 = new ActionRowBuilder().addComponents(teSelectMenu2);

            await interaction.update({
                content: `Du hast **${selectedOv}** gewählt. Nun wähle deine Teileinheit:`,
                components: [row1, row2],
                ephemeral: true
            });

            const messageData = cacheMap.get(interaction.message.id);
            messageData.selectedOv = selectedOv;
            cacheMap.set(interaction.message.id, messageData);
            saveCacheToFile();
        }
    }

    if (interaction.isStringSelectMenu() && (interaction.customId === 'select_te_1' || interaction.customId === 'select_te_2')) {
        const selectedTe = interaction.values[0].replace('te_', '');
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('choose_username')
                .setLabel('Benutzernamen wählen')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('skip_username')
                .setLabel('Überspringen')
                .setStyle(ButtonStyle.Secondary)
        );

        const messageData = cacheMap.get(interaction.message.id);
        if (!messageData) {
            await interaction.reply({ content: 'Fehler: Nachricht nicht gefunden.', ephemeral: true });
            return;
        }

        const oeEntry = oeData.find(entry =>
            entry["Landesverband/AZ"] === messageData.selectedLv &&
            entry["Regionalstelle"] === messageData.selectedRs &&
            entry["Ortsverband"] === messageData.selectedOv
        );
        const oeKuerzel = oeEntry ? oeEntry["OE-Kürzel"] : 'Unbekannt';

        // Konsolenausgabe zur Überprüfung des OE-Kürzels
        console.log(`OE-Kürzel: ${oeKuerzel}`);

        await interaction.update({
            content: `Du hast **${selectedTe}** gewählt. Auswahl abgeschlossen. Möchtest du einen Benutzernamen wählen oder überspringen?\nTeileinheit: **${selectedTe}**\nOE-Kürzel: **${oeKuerzel}**`,
            components: [buttons],
            ephemeral: true
        });

        messageData.selectedTe = selectedTe;
        cacheMap.set(interaction.message.id, messageData);
        saveCacheToFile();
    }

    if (interaction.isButton()) {
        const messageData = cacheMap.get(interaction.message.id);
        if (!messageData) {
            await interaction.reply({ content: 'Fehler: Nachricht nicht gefunden.', ephemeral: true });
            return;
        }

        if (interaction.customId === 'choose_username') {
            const modal = new ModalBuilder()
                .setCustomId('username_modal')
                .setTitle('Benutzernamen wählen')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('username_input')
                            .setLabel('Benutzername')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false)
                    )
                );

            await interaction.showModal(modal);
        }

        if (interaction.customId === 'skip_username') {
            let username = interaction.user.username;
            const match = interaction.message.content.match(/Teileinheit: \*\*(.*?)\*\*/);
            if (!match) {
                await interaction.reply({ content: 'Fehler: Teileinheit nicht gefunden.', ephemeral: true });
                return;
            }
            const selectedTe = match[1];
            const oeEntry = oeData.find(entry =>
                entry["Landesverband/AZ"] === messageData.selectedLv &&
                entry["Regionalstelle"] === messageData.selectedRs &&
                entry["Ortsverband"] === messageData.selectedOv
            );
            const oeKuerzel = oeEntry ? oeEntry["OE-Kürzel"] : 'Unbekannt';
            const nickname = `${username} | ${selectedTe} - ${oeKuerzel}`;

            const member = await interaction.guild.members.fetch(interaction.user.id);
            await member.setNickname(nickname);

            await interaction.update({ content: `Dein Nickname wurde auf ${nickname} gesetzt.`,components: [], ephemeral: true });

            // Nachricht aus der cacheMap entfernen
            cacheMap.delete(interaction.message.id);
            saveCacheToFile();
        }
    }

    if (interaction.isModalSubmit()) {
        const messageData = cacheMap.get(interaction.message.id);
        if (!messageData) {
            await interaction.reply({ content: 'Fehler: Nachricht nicht gefunden.', ephemeral: true });
            return;
        }

        if (interaction.customId === 'username_modal') {
            try {
                let username = interaction.user.username;
                const input = interaction.fields.getTextInputValue('username_input');
                if (input) {
                    username = input;
                }

                const match = interaction.message.content.match(/Teileinheit: \*\*(.*?)\*\*/);
                if (!match) {
                    await interaction.reply({ content: 'Fehler: Teileinheit nicht gefunden.', ephemeral: true });
                    return;
                }
                const selectedTe = match[1];
                const oeEntry = oeData.find(entry =>
                    entry["Landesverband/AZ"] === messageData.selectedLv &&
                    entry["Regionalstelle"] === messageData.selectedRs &&
                    entry["Ortsverband"] === messageData.selectedOv
                );
                const oeKuerzel = oeEntry ? oeEntry["OE-Kürzel"] : 'Unbekannt';
                const nickname = `${username} | ${selectedTe} - ${oeKuerzel}`;

                const member = await interaction.guild.members.fetch(interaction.user.id);
                await member.setNickname(nickname);

                await interaction.update({ content: `Dein Nickname wurde auf ${nickname} gesetzt.`,components: [], ephemeral: true });

                // Nachricht aus der cacheMap entfernen
                cacheMap.delete(interaction.message.id);
                saveCacheToFile();
            } catch (error) {
                console.error('Fehler beim Verarbeiten des Modals:', error);
                await interaction.update({ content: 'Etwas ist schief gelaufen. Bitte versuche es erneut.', ephemeral: true });
            }
        }
    }
});

client.login(config.token);