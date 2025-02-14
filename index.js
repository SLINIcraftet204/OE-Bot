const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActivityType, REST, Routes } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

async function parsePDF(filePath) {
    try {
        const pdfjs = await import('pdfjs-dist');
        const doc = await pdfjs.getDocument(filePath).promise;
        let text = '';
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join('\n') + '\n';
        }
        return text.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
        console.error('Fehler beim Parsen der PDF:', error);
        return [];
    }
}

async function loadOeData() {
    try {
        const lines = await parsePDF('Liste-OE-Kuerzel.pdf');
        let oeData = {};
        lines.forEach(line => {
            const parts = line.split(/\s{2,}/);
            if (parts.length >= 4) {
                const [lv, rs, ov, kuerzel] = parts.slice(-4);
                if (!oeData[lv]) oeData[lv] = {};
                if (!oeData[lv][rs]) oeData[lv][rs] = {};
                oeData[lv][rs][ov] = kuerzel;
            }
        });
        return oeData;
    } catch (error) {
        console.error('Fehler beim Laden der OE-Daten:', error);
        return {};
    }
}

let oeData = {};
loadOeData().then(data => oeData = data);

const teileinheiten = [
    "I", "R-A", "R-B", "R-C", "W-A", "W-B", "O-A", "O-B", "O-C",
    "E", "WP-A", "WP-B", "WP-C", "N", "SB-A", "SB-B", "Log-MW", "Log-V",
    "F", "K-A", "K-B", "TW", "Öl-A", "Öl-B", "Öl-C", "BT", "BrB",
    "Sp", "MT", "ENT", "ESS", "MHP", "UL", "TS", "SEEBA", "SEEWA", "SEELift",
    "SEC", "HCP", "TAST", "ETS"
];

const rpcStatuses = {
    listening: [
        "Hört was so im BOS Funkverkehr abgeht.",
        "Hört den Gruppenführer beim Üben des Einsatzbefehls.",
        "Hört den Funkverkehr der Landkreise.",
        "Hört, wie der Einsatzleiter die Lage analysiert.",
        "Hört den Funkverkehr von der Leitstelle.",
        "Hört den Betrieb der Einsatzfahrzeuge.",
        "Hört den Lärm der Einsatzstellen.",
        "Hört, wie die Helfer ihre Aufgaben koordinieren.",
        "Hört, wie der Funkkontakt zur Führungsebene besteht.",
        "Hört das Geplänkel beim Aufbau der Einsatzstelle."
    ],
    watching: [
        "Schaut, ob die Helfer ihren Aufgaben nachkommen.",
        "Überwacht die Logistik bei der Verpflegung der Helfer.",
        "Schaut, wie das Material auf der Einsatzstelle ankommt.",
        "Überwacht das Setup der Geräte und Maschinen.",
        "Schaut, ob alle Fahrzeuge bereitstehen.",
        "Überwacht die Kommunikation im Team.",
        "Schaut, wie das Team die Einsatztechnik überprüft.",
        "Überwacht den Stand der Technik in der Einsatzleitung.",
        "Schaut, ob das Team effizient arbeitet.",
        "Überwacht die Arbeit der Teams vor Ort."
    ],
    playing: [
        "Spielt dem Gruppenführer einen Streich.",
        "Täuscht eine Nachricht von der Feuerwehr vor.",
        "Versteckt das Funkgerät des Zugführers.",
        "Tauscht die Wäsche der Helfer gegen Feuerzeuge.",
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
    await registerCommands();
    updateStatus();
});

const commands = [
    new SlashCommandBuilder().setName('setname').setDescription('Starte die Namenskonfiguration'),
    new SlashCommandBuilder().setName('send-gui').setDescription('Sende das GUI in einen bestimmten Kanal (Befehl Administratoren vorbehalten)').addChannelOption(option =>
        option.setName('channel').setDescription('Kanal auswählen').setRequired(true)),
    new SlashCommandBuilder().setName('help').setDescription('Zeigt eine Liste aller Befehle'),
    new SlashCommandBuilder().setName('registercommands').setDescription('Registriere oder aktualisiere die Slash-Befehle (Befehl BotEntwickler vorbehalten)')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

async function registerCommands() {
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
    } catch (error) {
        console.error('Fehler beim Registrieren der Befehle:', error);
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'registercommands') {
        if (interaction.user.id !== '407566758535495701') {
            return interaction.reply({ content: 'Du hast keine Berechtigung, diesen Befehl auszuführen!', ephemeral: true });
        }
        await registerCommands();
        await interaction.reply({ content: 'Slash-Befehle wurden aktualisiert.', ephemeral: true });
    }

    if (interaction.commandName === 'help') {
        const embed = new EmbedBuilder()
            .setTitle('OE Bot Hilfe')
            .setDescription('/setname - Starte die Namenskonfiguration\n/send-gui [channel] - Sende das GUI in einen bestimmten Kanal (Befehl Administratoren vorbehalten)\n/help - Zeigt diese Hilfe an\n/registercommands - Aktualisiert die Slash-Befehle (Befehl BotEntwickler vorbehalten)');
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

client.login(config.token);
