process.on('uncaughtException', function (err) {
    console.log(err);
});
//prende i parametri del database del .env
const path = require('path')
require('dotenv').config({
    override: true,
    path: path.join(__dirname,'development.env')
});

const {Client,Pool} = require ('pg');

const kpi_table_name = process.env.KPI_TABLE_NAME;
const data_table_name = process.env.DATA_TABLE_NAME;

const pool = new Pool({
    user: process.env.USER,
    host: process.env.HOST,
    database: process.env.DATA,
    password: process.env.PASSWORD,
    port: process.env.PORT
});

(async() =>{
    const client = await pool.connect();
    try{    
       const {rows} = await client.query(kpiColumQuery("'most_used_machine_id'", kpi_table_name, '*'));
       if(rows[0].children === null){
        console.log("Query prima: ", rows[0].query);
        const paramsObj = {
            startDate: "'2023-05-01'",
            endDate: "'2023-06-01'",
            dataTableName: data_table_name
        };
        console.log("Query dopo: ", replaceWithValue(rows[0].query,paramsObj));
        const ret = await client.query(replaceWithValue(rows[0].query,paramsObj));
        console.log("ID DELLA MACCHINA= ", ret.rows[0].id);
       }
       
      
    }catch(e){
        console.error('Error:', e);
    }finally{
        client.release();
    }

})();


function replaceWithValue(inputString, params){
      // Utilizza una regex per cercare tutte le corrispondenze nel formato ${paramName}
  const regex = /\${(.*?)}/g;

  // Usa il metodo replace() per sostituire ogni corrispondenza con il valore corrispondente
  const outputString = inputString.replace(regex, (match, paramName) => {
    // Verifica se il parametro esiste nell'oggetto params
    if (params.hasOwnProperty(paramName)) {
      // Restituisci il valore corrispondente al parametro
      return params[paramName];
    } else {
      // Se il parametro non esiste, mantieni la corrispondenza originale
      return match;
    }});

    return outputString;
}


function kpiColumQuery (kpi_id, table_name, colum){
    
    return ('select '+colum+' from '+table_name +" where id = "+ kpi_id);
}
