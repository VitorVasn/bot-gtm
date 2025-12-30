// ===============================
// 🌐 SERVIDOR WEB (obrigatório Render)
// ===============================
const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('🤖 Bot GTM online!'));

app.listen(PORT, () => console.log(`🌐 Servidor web ativo na porta ${PORT}`));

// ===============================
// 🤖 BOT DISCORD
// ===============================
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

// --- Configuração do bot ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// --- Variáveis do ranking ---
const ranking = {};
const fsRanking = './rankingMessage.json';

// --- Slash command ---
const commands = [
  new SlashCommandBuilder()
    .setName('resetar-ranking')
    .setDescription('Reseta o ranking manualmente (ADMIN)')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.BOT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Comando /resetar-ranking registrado!');
  } catch (err) {
    console.error('❌ Erro ao registrar comando:', err.message);
  }
})();

// --- Bot pronto ---
client.once('ready', () => {
  console.log(`🤖 Bot online como ${client.user.tag}`);
});

// --- Interações com slash commands ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'resetar-ranking') {
    if (interaction.user.id !== process.env.ADMIN_ID)
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });

    for (const p in ranking) ranking[p].pontos = 0;
    interaction.reply({ content: '🔄 Ranking resetado!', ephemeral: true });
  }
});

// --- Resposta automática a mensagens (exemplo) ---
client.on('messageCreate', message => {
  if (message.author.bot) return;

  if (message.content === '!ping') {
    message.reply('Pong!');
  }
});

// --- Login do bot ---
client.login(process.env.TOKEN);
