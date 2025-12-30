const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
  new SlashCommandBuilder()
    .setName('gtm')
    .setDescription('Comando principal da GTM'),

  new SlashCommandBuilder()
    .setName('registro')
    .setDescription('Registrar ocorrência da GTM')
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('🔄 Registrando comandos...');
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log('✅ Comandos registrados');
  } catch (error) {
    console.error(error);
  }
})();
