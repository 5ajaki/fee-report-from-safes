const Web3 = require("web3"); // Import Web3 at the top

const fs = require("fs");
const { parse } = require("csv-parse");
const fetchAllTransactions = require("./fetchAllTransactions");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

// Function to read safes from CSV
const readSafesFromCSV = async (filePath) => {
  const safes = [];
  const parser = fs.createReadStream(filePath).pipe(
    parse({
      delimiter: ",",
      from_line: 2, // Assuming there's a header
      relax_column_count: true,
    })
  );

  for await (const row of parser) {
    try {
      const checksumAddress = Web3.utils.toChecksumAddress(row[0].trim());
      safes.push(checksumAddress);
    } catch (error) {
      console.error(`Invalid address format: ${row[0].trim()}`, error);
    }
  }

  return safes;
};

// Main function
const multiSafeFeeExtract = async () => {
  const safes = await readSafesFromCSV("safes.csv");
  let allTransactions = [];
  let executorSummary = {};

  for (const safe of safes) {
    console.log(`Fetching transactions for safe: ${safe}`);
    const transactions = await fetchAllTransactions(safe);
    allTransactions.push(...transactions);

    transactions.forEach((tx) => {
      if (tx.executor && tx.fee) {
        const feeInEther = parseFloat(tx.fee) / 1e18; // Convert fee from Wei to Ether
        if (!executorSummary[tx.executor]) {
          executorSummary[tx.executor] = { totalFee: 0, txCount: 0 };
        }
        executorSummary[tx.executor].totalFee += feeInEther;
        executorSummary[tx.executor].txCount++;
      }
    });
  }

  // Prepare data for CSV output
  const detailedTransactions = allTransactions.map((tx) => ({
    nonce: tx.nonce,
    transactionHash: tx.transactionHash,
    executor: tx.executor,
    fee: tx.fee ? parseFloat(tx.fee) / 1e18 : NaN, // Convert fee from Wei to Ether
    executionDate: tx.executionDate,
  }));

  const summaryData = Object.entries(executorSummary).map(
    ([address, data]) => ({
      ENSName: "", // Placeholder for future ENS name resolution
      Address: address,
      Amount: data.totalFee.toFixed(18), // Format the total fee to 18 decimal places
      numberOfTxs: data.txCount,
    })
  );

  // Function to write data to a CSV file
  const writeToCSV = (data, filename, headers) => {
    const csvWriter = createCsvWriter({ path: filename, header: headers });
    csvWriter
      .writeRecords(data)
      .then(() => console.log(`Written data to ${filename}`));
  };

  // To help filter out transactions with no nonce
  const validTransactions = detailedTransactions.filter(
    (tx) => tx.nonce !== undefined && tx.nonce !== null
  );

  // Writes the two files with only the valid transactions
  writeToCSV(validTransactions, "detailedTransactions.csv", [
    { id: "nonce", title: "Nonce" },
    { id: "transactionHash", title: "Transaction Hash" },
    { id: "executor", title: "Executor" },
    { id: "fee", title: "Fee (in Ether)" },
    { id: "executionDate", title: "Execution Date" },
  ]);

  writeToCSV(summaryData, "executorSummary.csv", [
    { id: "ENSName", title: "ENS Name" },
    { id: "Address", title: "Address" },
    { id: "Amount", title: "Amount" },
    { id: "numberOfTxs", title: "Number of Transactions" },
  ]);
};

multiSafeFeeExtract();
