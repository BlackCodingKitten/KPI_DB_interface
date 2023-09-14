process.on('uncaughtException', function (err) {
    console.log(err);
});
//read connection parameters from .env file
const path = require('path')
require('dotenv').config({
    override: true,
    path: path.join(__dirname,'development.env')
});

const {Client,Pool} = require ('pg');

const kpi_table_name = process.env.KPI_TABLE_NAME;
const data_table_name = process.env.DATA_TABLE_NAME;

//create a pool with .env param
const pool = new Pool({
    user: process.env.USER,
    host: process.env.HOST,
    database: process.env.DATA,
    password: process.env.PASSWORD,
    port: process.env.PORT
});

(async() =>{

    const paramsObj = {
        timeSecond: 70300,
        startDate: "'2023-05-01'",
        endDate: "'2023-06-01'",
        dataTableName: data_table_name
    };
    

    const client = await pool.connect();
    // console.log("client on");
    try{  
        const kpiId = toParams("power_cost_per_hour") ;
        const kpiRows = await client.query(kpiColumQuery(kpiId, kpi_table_name));
        // console.log(kpiColumQuery(kpiId, kpi_table_name));
         //console.log(kpiRows);

        //check for children to understand if it's Primary KPI or Secondary KPI
        if(kpiRows.rows[0]['children'] ===  null){
            //kpiRow[0].children = null => kpiRow[0].query => !null


            const retRow = await client.query(replaceWithValue(kpiRows.rows[0]['query'],paramsObj));
            console.log(kpiRows.rows[0]['id'] +": "+retRow.rows[0]['v']);
        }else{
            //children is !null => query = null
            //console.log(kpiRows.rows[0]['children']);
            var  childArray = [];
            for(var child of kpiRows.rows[0]['children']){
               // console.log(child);
                const childRetRow = await client.query(kpiColumQuery(toParams(child),kpi_table_name));
                //console.log(replaceWithValue(childRetRow.rows[0]['query'], paramsObj));
                var value ={
                    id: child,
                    valueRow : (await client.query(replaceWithValue(childRetRow.rows[0]['query'], paramsObj))).rows[0]['v']
                };
                childArray.push(value);
            }
            console.log(childArray);
            // the interface need to read which are the children, so it can ask for 
            //the value to use in the function aqcuired by read function
            //colum from kpi table 
            
        }   
    }catch(e){
        //print error code and detail
        console.error('Error:', e);
    }finally{
        //in each case release client
        client.release();
    }

})();

//insert into query read from measured data database value into dollar regex
function replaceWithValue(inputString, params){
    // Use a regex to search for all matches in the format ${paramName}
    const regex = /\${(.*?)}/g;

    // Use the replace() method to replace each match with the corresponding value
    const outputString = inputString.replace(regex, (match, paramName) => {
    // Checks whether the parameter exists in the params object
    if (params.hasOwnProperty(paramName)) {
        //Return the value corresponding to parameter
        return params[paramName];
    } else {
        // If the parameter does not exist, keep the original match
        return match;
}});

return outputString;
}

//trasform string into query params
function toParams(str){
    return ("'"+str+"'"); 
}

//write the query to search into kpi table
function kpiColumQuery (kpi_id, table_name){ 
    return ('select id,query,children,function from '+table_name +" where id ="+ kpi_id);
}

//convert hours into seconds, the time unit measured from Iot device
function hoursToSecond(hours){
    return hours*60*60;
}
