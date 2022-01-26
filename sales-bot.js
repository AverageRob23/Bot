const solanaWeb3 = require('@solana/web3.js');
const { Connection, programs } = require('@metaplex/js')
const axios = require('axios');

// Check if the env variables have been set
if(!process.env.PROJECT_ADDRESS || !process.env.DISCORD_URL) {
    console.log("Please set your environment variables!")
    return;
}

// Initialize constants
const url = solanaWeb3.clusterApiUrl('mainnet-beta')
const timer = ms => new Promise(res => setTimeout(res, ms))
const connection = new solanaWeb3.Connection(url, 'confirmed');
const metaplexConnection = new Connection('mainnet-beta')
const {  metadata: { Metadata } } = programs;
const projectPubKey = new solanaWeb3.PublicKey(process.env.PROJECT_ADDRESS);
const marketplaceMap = {
    "MEisE1HzehtrDpAAT8PnLHjpSSkRYakotTuJRPjTpo8": "Magic Eden",
    "HZaWndaNWHFDd9Dhk5pqUUtsmoBCqzb1MLu3NAh1VX6B": "Alpha Art",
    "617jbWo616ggkDxvW1Le8pV38XLbVSyWY8ae6QUmGBAU": "Solsea",
    "CJsLwbP1iu5DuUikHEJnLfANgKy6stB2uFgvBBHoyxwz": "Solanart",
    "A7p8451ktDCHq5yYaHczeLMYsjRsAkzc3hCXcSrwYHU7": "Digital Eyes"
}
const pollingInterval = 2000; // ms

/* 
  runSalesBot continuously polls the given project address for new txns,
  checks if the txns are sales from a valid marketplace, 
  and posts the sale details to Discord
*/
const runSalesBot = async () => {
    console.log("starting sales bot...");
    
    let signatures;
    let lastKnownSignature;
    const options = {};

    const bootDate = new Date();

    while(true) {
        try {
            await timer(1000);
            signatures = await connection.getSignaturesForAddress(projectPubKey, options);
            if(!signatures.length) {
                await timer(pollingInterval);
                continue;
            }
        } catch(err) {
            console.log("error fetching signatures: ", err);
            continue;
        }
        
        for(let i = signatures.length - 1; i >= 0; i--) {
            try {
                await timer(1000);
                let { signature } = signatures[i];
                const txn = await connection.getTransaction(signature);  
                if(txn.meta && txn.meta.err != null) { continue; }
    
                const date = new Date(txn.blockTime * 1000);
                console.log({ date, bootDate}, date < bootDate, signature)
                if(date < bootDate) { continue; } // remove this line if you want to backfill historic sales

                const dateString = date.toLocaleString();
                const price = Math.abs((txn.meta.preBalances[0] - txn.meta.postBalances[0]))/solanaWeb3.LAMPORTS_PER_SOL;
                const accounts = txn.transaction.message.accountKeys;
                const marketplaceAccount = accounts[accounts.length - 1].toString();
                if (marketplaceMap[marketplaceAccount]) {
                    const metadata = await getMetadata(txn.meta.postTokenBalances[0].mint);
                    if (!metadata) { 
                        console.log("couldn't get metadata");
                        continue;
                    }
                    
                    printSalesInfo(dateString, price, signature, metadata.name, marketplaceMap[marketplaceAccount], metadata.image);
                    // await postSaleToDiscord(metadata.data.name, price, dateString, signature, metadata.data.uri)
                } else {
                    console.log("not a supported marketplace sale");
                }
            } catch(err) {
                console.log("error while going through signatures: ", err)
                continue;
            }
        }

        lastKnownSignature = signatures[signatures.length - 1].signature;
        if (lastKnownSignature.length) {
            options.until = lastKnownSignature
        }
    }
}

runSalesBot();

const printSalesInfo = (date, price, signature, title, marketplace, imageURL) => {
    console.log("-------------------------------------------")
    console.log(`Sale at ${date} ---> ${price} SOL`)
    console.log("Signature: ", signature)
    console.log("Name: ", title)
    console.log("Image: ", imageURL)
    console.log("Marketplace: ", marketplace)
}

const getMetadata = async (tokenPubKey) => {
    try {
        const add = await Metadata.getPDA(tokenPubKey)
        const resp = await Metadata.load(metaplexConnection, add);
        const { data } = await axios.get(resp.data.data.uri);
        return data;
    } catch(error) {
        console.log("error fetching metadata: ", error)
    }
}

const postSaleToDiscord = (title, price, date, signature, imageURL) => {
    axios.post(process.env.DISCORD_URL,
        {
            "embeds": [
                {
                    "title": `SALE`,
                    "description": `${title}`,
                    "fields": [
                        {
                        "name": "Price",
                        "value": `${price} SOL`,
                        "inline": true
                        },
                        {
                        "name": "Date",
                        "value": `${date}`,
                        "inline": true
                        },
                        {
                        "name": "Explorer",
                        "value": `https://explorer.solana.com/tx/${signature}`
                        }
                    ],
                    "image": {
                        "url":  `${imageURL}`,
                    }
                }
            ]
        }    
    )
}



// const getMetadata = async (mintAddress) => {
//     try {
//         const { data } = await axios.get(`https://api-mainnet.magiceden.io/rpc/getNFTByMintAddress/${mintAddress}`);
//         return data;
//     } catch(error) {
//         console.error("Error while fetching metadata: ", error)
//     }
// }