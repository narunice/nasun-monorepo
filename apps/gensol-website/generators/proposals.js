const generatePTBCommand = ({ packageId, adminCapId, dashboardId, numProposals }) => {
    let command = "sui client ptb";
  
    for (let i = 1; i <= numProposals; i++) {
      // Generate timestamp: current date + 1 year + incremental seconds
      const currentDate = new Date();
      const oneYearFromNow = new Date(currentDate.setFullYear(currentDate.getFullYear() + 1));
      const timestamp = oneYearFromNow.getTime() + i * 1000; // Add 1 second per proposal
      const timestampId = Math.floor(Math.random() * 100000 * i);
  
      const title = `Proposal ${timestampId}`;
      const description = `Proposal description ${timestampId}`;
  
      // Add proposal creation command
      command += ` \\
    --move-call ${packageId}::proposal::create \\
    @${adminCapId} \\
    '"${title}"' '"${description}"' ${timestamp} \\
    --assign proposal_id`;
  
      // Add dashboard registration command
      command += ` \\
    --move-call ${packageId}::dashboard::register_proposal \\
    @${dashboardId} \\
    @${adminCapId} proposal_id`;
    }
  
    return command;
  };
  
  // Inputs
  const inputs = {
    packageId: "0x9a67aa70689b18d1ff86064a55e606cb6b4e447dce1de185448f1617386a77fd",
    adminCapId: "0x940efaa9f789db92299d27ffc46c63bd3102b907e8cc0fbece50f644c881e368",
    dashboardId: "0x92e25ba8fe1f6954777803abfbae6ab384f00b9238d579a275c06e9f7ce6927e",
    numProposals: 3, // Specify the number of proposals to generate
  };
  
  // Generate the command
  const ptbCommand = generatePTBCommand(inputs);
  console.log(ptbCommand);