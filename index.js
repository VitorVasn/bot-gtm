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

// --- Configurações ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const ranking = {};
const fsRanking = './rankingMessage.json';
let chequeResetDoDia = false;

// --- Registrar slash command /resetar-ranking ---
const commands = [
  new SlashCommandBuilder()
    .setName('resetar-ranking')
    .setDescription('Reseta o ranking manualmente (somente para o ADMIN)')
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
    console.error('❌ Erro ao registrar comando:', err);
  }
})();

// --- Inicialização do bot ---
client.once('ready', async () => {
  console.log(`🤖 Bot online como ${client.user.tag}`);

  const canalRegistroId = '1450237461824536670'; // Canal de registro
  const canal = await client.channels.fetch(canalRegistroId);

  const botao = new ButtonBuilder()
    .setCustomId('abrir_registro')
    .setLabel('📋 PREENCHER FORMULÁRIO')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(botao);

  let data = { registroMessageId: '' };
  if (fs.existsSync('./message.json')) data = JSON.parse(fs.readFileSync('./message.json'));

  if (data.registroMessageId) {
    try {
      const msg = await canal.messages.fetch(data.registroMessageId);
      await msg.edit({
        content: '🏍️ **GTM — REGISTRO DE ACOMPANHAMENTO**\nClique no botão abaixo para registrar sua ocorrência:',
        components: [row]
      });
    } catch {
      const msg = await canal.send({
        content: '🏍️ **GTM — REGISTRO DE ACOMPANHAMENTO**\nClique no botão abaixo para registrar sua ocorrência:',
        components: [row]
      });
      data.registroMessageId = msg.id;
      fs.writeFileSync('./message.json', JSON.stringify(data, null, 2));
    }
  } else {
    const msg = await canal.send({
      content: '🏍️ **GTM — REGISTRO DE ACOMPANHAMENTO**\nClique no botão abaixo para registrar sua ocorrência:',
      components: [row]
    });
    data.registroMessageId = msg.id;
    fs.writeFileSync('./message.json', JSON.stringify(data, null, 2));
  }

  // Checagem de reset mensal a cada hora
  setInterval(() => checarResetMensal(client), 1000 * 60 * 60);
});

// --- Interações ---
client.on('interactionCreate', async interaction => {
  try {
    // --- Slash command /resetar-ranking ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'resetar-ranking') {
      if (interaction.user.id !== process.env.ADMIN_ID) {
        await interaction.reply({ content: '❌ Você não tem permissão para usar este comando.', ephemeral: true });
        return;
      }
      for (const passaporte in ranking) ranking[passaporte].pontos = 0;
      await atualizarRanking(client);
      await interaction.reply({ content: '🔔 Ranking manualmente zerado com sucesso!', ephemeral: true });
      return;
    }

    // --- Botão de registro ---
    if (interaction.isButton() && interaction.customId === 'abrir_registro') {
      const modal = new ModalBuilder()
        .setCustomId('registro_modal')
        .setTitle('Registro de Ocorrência GTM');

      const nome = new TextInputBuilder()
        .setCustomId('nome')
        .setLabel('Nome do GTM')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const passaporte = new TextInputBuilder()
        .setCustomId('passaporte')
        .setLabel('Passaporte')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nome),
        new ActionRowBuilder().addComponents(passaporte)
      );

      await interaction.showModal(modal);
      return;
    }

    // --- Modal de registro ---
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'registro_modal') {
      const nome = interaction.fields.getTextInputValue('nome');
      const passaporte = interaction.fields.getTextInputValue('passaporte');

      if (!ranking[passaporte]) {
        ranking[passaporte] = { nome, pontos: 0, finalizado: false };
      } else {
        ranking[passaporte].nome = nome;
        ranking[passaporte].finalizado = false;
      }

      const qruMenu = new StringSelectMenuBuilder()
        .setCustomId(`qru_${passaporte}`)
        .setPlaceholder('Tipo de QRU / Ocorrência')
        .addOptions(
          { label: 'Tráfico de drogas', value: 'trafico' },
          { label: 'Roubo a registradora', value: 'registradora' },
          { label: 'Roubo de veículo', value: 'veiculo' },
          { label: 'Roubo porta-malas', value: 'portamalas' },
          { label: 'Roubo a ATM', value: 'atm' },
          { label: 'Acompanhamento', value: 'acompanhamento' }
        );

      await interaction.reply({
        content: `👤 **${nome}**\nSelecione o tipo de ocorrência:`,
        components: [new ActionRowBuilder().addComponents(qruMenu)],
        ephemeral: true
      });
      return;
    }

    // --- Seleção de ocorrência ---
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('qru_')) {
      const passaporte = interaction.customId.split('_')[1];

      const resultadoMenu = new StringSelectMenuBuilder()
        .setCustomId(`resultado_${passaporte}`)
        .setPlaceholder('Resultado do acompanhamento')
        .addOptions(
          { label: '✅ Concluído', value: 'concluido' },
          { label: '❌ QTA (queda / fuga)', value: 'qta' }
        );

      await interaction.update({
        content: '🏍️ Resultado do acompanhamento:',
        components: [new ActionRowBuilder().addComponents(resultadoMenu)]
      });
      return;
    }

    // --- Resultado ---
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('resultado_')) {
      const passaporte = interaction.customId.split('_')[1];
      ranking[passaporte].resultado = interaction.values[0];

      const prisaoMenu = new StringSelectMenuBuilder()
        .setCustomId(`prisao_${passaporte}`)
        .setPlaceholder('Houve prisão?')
        .addOptions(
          { label: '🚔 Sim', value: 'sim' },
          { label: '❌ Não', value: 'nao' }
        );

      await interaction.update({
        content: '🚔 Houve prisão na ocorrência?',
        components: [new ActionRowBuilder().addComponents(prisaoMenu)]
      });
      return;
    }

    // --- Prisão ---
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('prisao_')) {
      const passaporte = interaction.customId.split('_')[1];
      if (ranking[passaporte].finalizado) return;

      ranking[passaporte].houvePrisao = interaction.values[0];

      if (interaction.values[0] === 'nao') {
        ranking[passaporte].finalizado = true;
        await finalizarRegistro(interaction, passaporte, 0);
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`presos_${passaporte}`)
        .setTitle('Quantidade de presos');

      const qtd = new TextInputBuilder()
        .setCustomId('qtd_presos')
        .setLabel('Quantos presos?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(qtd));
      await interaction.showModal(modal);
      return;
    }

    // --- Modal de presos ---
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('presos_')) {
      const passaporte = interaction.customId.split('_')[1];
      if (ranking[passaporte].finalizado) return;

      const qtd = parseInt(interaction.fields.getTextInputValue('qtd_presos')) || 0;
      ranking[passaporte].finalizado = true;
      await finalizarRegistro(interaction, passaporte, qtd);
      return;
    }

  } catch (err) {
    console.error('Erro ao processar interação:', err.message);
  }
});

// --- Finalizar registro ---
async function finalizarRegistro(interaction, passaporte, qtdPresos) {
  let pontos = 1;
  if (ranking[passaporte].resultado === 'concluido') pontos += 2;
  if (ranking[passaporte].houvePrisao === 'sim') pontos += 5 + (qtdPresos * 3);
  ranking[passaporte].pontos += pontos;

  try {
    if (interaction.update) await interaction.update({ content: '✅ Registro finalizado!', components: [] });
    else if (interaction.editReply) await interaction.editReply({ content: '✅ Registro finalizado!', components: [] });
  } catch {}

  await interaction.followUp({
    content:
      `👤 ${ranking[passaporte].nome}\n` +
      `🪪 Passaporte: ${passaporte}\n` +
      `🚔 Prisão: ${ranking[passaporte].houvePrisao === 'sim' ? 'Sim' : 'Não'}\n` +
      `👥 Presos: ${qtdPresos}\n` +
      `⭐ Pontos ganhos: ${pontos}\n` +
      `🏆 Total no ranking: ${ranking[passaporte].pontos}`,
    ephemeral: true
  });

  await atualizarRanking(interaction.client).catch(console.error);
}

// --- Ranking fixo ---
function gerarRanking() {
  const top = Object.entries(ranking)
    .sort(([, a], [, b]) => b.pontos - a.pontos)
    .slice(0, 10);

  if (top.length === 0) return '🏆 **RANKING GTM**\nNenhum registro ainda.';

  let texto = '🏆 **RANKING GTM — TOP 10**\n';
  top.forEach(([passaporte, info], i) => {
    texto += `\n${i + 1}. **${info.nome}** — ⭐ ${info.pontos} pts — 🪪 ${passaporte}`;
  });

  return texto;
}

// --- Atualizar ranking ---
async function atualizarRanking(client) {
  const canalRankingId = '1450237999429189733';
  const canal = await client.channels.fetch(canalRankingId);

  let data = { rankingMessageId: '' };
  if (fs.existsSync(fsRanking)) data = JSON.parse(fs.readFileSync(fsRanking));

  if (data.rankingMessageId) {
    try {
      const msg = await canal.messages.fetch(data.rankingMessageId);
      await msg.edit({ content: gerarRanking() });
      return;
    } catch {
      const msg = await canal.send({ content: gerarRanking() });
      data.rankingMessageId = msg.id;
      fs.writeFileSync(fsRanking, JSON.stringify(data, null, 2));
    }
  } else {
    const msg = await canal.send({ content: gerarRanking() });
    data.rankingMessageId = msg.id;
    fs.writeFileSync(fsRanking, JSON.stringify(data, null, 2));
  }
}

// --- Reset mensal ---
function checarResetMensal(client) {
  const agora = new Date();
  const dia = agora.getDate();

  if (dia === 1 && !chequeResetDoDia) {
    chequeResetDoDia = true;
    rankingReset(client);
  }

  if (dia !== 1) chequeResetDoDia = false;
}

function rankingReset(client) {
  for (const passaporte in ranking) ranking[passaporte].pontos = 0;
  atualizarRanking(client).catch(console.error);

  const canalRankingId = '1450237999429189733';
  client.channels.fetch(canalRankingId).then(canal => {
    canal.send('🔔 **O ranking mensal foi zerado!** Todos os pontos começaram do zero.');
  });
}

// --- Login ---
client.login(process.env.TOKEN);
