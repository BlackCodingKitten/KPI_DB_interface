const path=require('path')
require('dotenv').config({
    override: true,
    path: path.join(__dirname,'developement.env')
});
const {Client,Pool} = require ('pg');


const pool = new Pool({
    user: process.env.USER,
    host: process.env.HOST,
    database: process.env.DATA,
    password: process.env.PASSWORD,
    port: 61000



});

(async() =>{
    const client = await pool.connect();
    try{    
        const {rows} = await client.query('SELECT * FROM kpi_table');
        for (const row of rows){
            console.log(row);
        }
    }catch(e){
        console.error('Error: ', e);
    }finally{
        client.release();
    }
})();
