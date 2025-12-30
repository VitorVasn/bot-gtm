const {
  Client,
  GatewayIntentBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionType,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const fs = require('fs');
require('dotenv').config();

/* ================= CONFIG ================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const RANKING_FILE = './ranking.json';
const MESSAGE_FILE = './message.json';
const RANKING_MESSAGE_FILE = './rankingMessage.json';

let ranking = {};
let chequeResetDoDia = false;

/* ================= UTIL ================= */

function salvarRanking() {
  fs.writeFileSync(RANKING_FILE, JSON.stringify(ranking, null, 2));
}

function carregarRanking() {
  if (fs.existsSync(RANKING_FILE)) {
    ranking = JSON.parse(fs.readFileSync(RANKING_FILE));
  }
}

/* ================= SLASH COMMAND ================= */

const commands = [
  new SlashCommandBuilder()
    .setName('resetar-ranking')
    .setDescription('Reseta o ranking manualmente (ADMIN)')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

async function registrarComandos() {
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.BOT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );
  console.log('✅ Slash commands registrados');
}

/* ================= BOT READY ================= */

client.once('ready', async () => {
  console.log(`🤖 Online como ${client.user.tag}`);

  carregarRanking();
  await registrarComandos();

  const canal = await client.channels.fetch('1450237461824536670');

  const botao = new ButtonBuilder()
    .setCustomId('abrir_registro')
    .setLabel('📋 PREENCHER FORMULÁRIO')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(botao);

  let data = { registroMessageId: '' };
  if (fs.existsSync(MESSAGE_FILE)) {
    data = JSON.parse(fs.readFileSync(MESSAGE_FILE));
  }

  try {
    if (data.registroMessageId) {
      const msg = await canal.messages.fetch(data.registroMessageId);
      await msg.edit({
        content: '🏍️ **GTM — REGISTRO DE ACOMPANHAMENTO**',
        components: [row]
      });
    } else {
      throw new Error();
    }
  } catch {
    const msg = await canal.send({
      content: '🏍️ **GTM — REGISTRO DE ACOMPANHAMENTO**',
      components: [row]
    });
    data.registroMessageId = msg.id;
    fs.writeFileSync(MESSAGE_FILE, JSON.stringify(data, null, 2));
  }

  setInterval(() => checarResetMensal(client), 1000 * 60 * 60);
});

/* ================= INTERAÇÕES ================= */

client.on('interactionCreate', async interaction => {
  try {
    /* ---- SLASH ---- */
    if (interaction.isChatInputCommand()) {
      if (interaction.user.id !== process.env.ADMIN_ID) {
        return interaction.reply({ content: '❌ Sem permissão', ephemeral: true });
      }
      for (const p in ranking) ranking[p].pontos = 0;
      salvarRanking();
      await atualizarRanking(client);
      return interaction.reply({ content: '🔄 Ranking resetado', ephemeral: true });
    }

    /* ---- BOTÃO ---- */
    if (interaction.isButton() && interaction.customId === 'abrir_registro') {
      const modal = new ModalBuilder()
        .setCustomId('registro_modal')
        .setTitle('Registro GTM');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('nome')
            .setLabel('Nome')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('passaporte')
            .setLabel('Passaporte')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      return interaction.showModal(modal);
    }

    /* ---- MODAL REGISTRO ---- */
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'registro_modal') {
      const nome = interaction.fields.getTextInputValue('nome');
      const passaporte = interaction.fields.getTextInputValue('passaporte');

      ranking[passaporte] ??= { nome, pontos: 0 };
      ranking[passaporte].nome = nome;

      salvarRanking();

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`resultado_${passaporte}`)
        .setPlaceholder('Resultado')
        .addOptions(
          { label: 'Concluído', value: 'ok' },
          { label: 'QTA', value: 'qta' }
        );

      return interaction.reply({
        content: '🏍️ Resultado do acompanhamento:',
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      });
    }

    /* ---- RESULTADO ---- */
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('resultado_')) {
      const passaporte = interaction.customId.split('_')[1];
      ranking[passaporte].pontos += interaction.values[0] === 'ok' ? 3 : 1;
      salvarRanking();

      await interaction.update({ content: '✅ Registro finalizado', components: [] });
      await atualizarRanking(interaction.client);
    }

  } catch (err) {
    console.error(err);
  }
});

/* ================= RANKING ================= */

function gerarRanking() {
  const top = Object.values(ranking)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 10);

  if (!top.length) return '🏆 **RANKING GTM**\nSem registros';

  return top
    .map((p, i) => `${i + 1}. **${p.nome}** — ⭐ ${p.pontos}`)
    .join('\n');
}

async function atualizarRanking(client) {
  const canal = await client.channels.fetch('1450237999429189733');

  let data = { rankingMessageId: '' };
  if (fs.existsSync(RANKING_MESSAGE_FILE)) {
    data = JSON.parse(fs.readFileSync(RANKING_MESSAGE_FILE));
  }

  try {
    if (data.rankingMessageId) {
      const msg = await canal.messages.fetch(data.rankingMessageId);
      await msg.edit({ content: gerarRanking() });
      return;
    }
    throw new Error();
  } catch {
    const msg = await canal.send({ content: gerarRanking() });
    data.rankingMessageId = msg.id;
    fs.writeFileSync(RANKING_MESSAGE_FILE, JSON.stringify(data, null, 2));
  }
}

/* ================= RESET MENSAL ================= */

function checarResetMensal(client) {
  const hoje = new Date().getDate();
  if (hoje === 1 && !chequeResetDoDia) {
    chequeResetDoDia = true;
    ranking = {};
    salvarRanking();
    atualizarRanking(client);
  }
  if (hoje !== 1) chequeResetDoDia = false;
}

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
