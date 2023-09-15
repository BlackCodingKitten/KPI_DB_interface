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

//save table name 
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
    //dati che avdranno poi passati da input: 
    let timeSecond = 69999;
    let startDate = '2023-06-01';
    let endDate = '2023-07-01';
    let flag = true;

    //param passed to interface function
    const paramsObj = {
        timeSecond: timeSecond,
        startDatePast: dateCalculator(startDate, [startDate,endDate], flag),
        endDatePast:   toParams(startDate),
        startDate: toParams(startDate),
        endDate: toParams(endDate),
        dataTableName: data_table_name
    };

    let kpiValue;
    
    const client = await pool.connect();
    // console.log("client on");
    try{  
        const kpiId = toParams("least_used_machine_id") ;
        const kpiRows = await client.query(kpiColumQuery(kpiId, kpi_table_name));
         // console.log(kpiColumQuery(kpiId, kpi_table_name));
         //console.log(kpiRows);

        //check for children to understand if it's Primary KPI or Secondary KPI
        if(kpiRows.rows[0]['children'] ===  null){
            //kpiRow[0].children = null => kpiRow[0].query => !null
            const retRow = await client.query(replaceWithValue(kpiRows.rows[0]['query'],paramsObj));
            kpiValue = retRow.rows[0]['v'];
            console.log(kpiRows.rows[0]['id'] +" = "+ kpiValue);
        }else{
            //children is !null => query = null
            //console.log(kpiRows.rows[0]['children']);
            /* the interface need to read which are the children, so it can ask for 
            the value to use in the function aqcuired by read function
            colum from kpi table */ 
            var  childArray = [];
            for(var child of kpiRows.rows[0]['children']){
               // console.log(child);
                const childRetRow = await client.query(kpiColumQuery(toParams(child),kpi_table_name));
                //console.log(replaceWithValue(childRetRow.rows[0]['query'], paramsObj));
                var value ={
                    id: child,
                    value: (await client.query(replaceWithValue(childRetRow.rows[0]['query'], paramsObj))).rows[0]['v']
                };
                childArray.push(value);
            }
            //console.log(childArray);
            //console.log(kpiRows.rows[0]['js_fun']);
            let operativeTime = Math.ceil(Math.abs(new Date(paramsObj.endDate)- new Date(paramsObj.startDate))/ (1000));
            kpiValue = evalAndApplyFunction(kpiRows.rows[0]['js_fun'],childArray, operativeTime);
            console.log(kpiRows.rows[0]['id']+" = "+kpiValue);
        }//end else
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
    return ('select * from '+table_name +" where id ="+ kpi_id);
}

//set the date to past 5 cycle period measuring difference with previuous period
function dateCalculator(date, [strD, endD], flag){
    const s = new Date(strD);
    const e = new Date(endD);
    //day subtraction is measured by milliseconds
    const period = Math.ceil(Math.abs(e-s)/ (1000*60*60*24)); 
    
    var pastDate = new Date (date);
    if(!flag){
        //last period
        pastDate.setDate(pastDate.getDate()-period);
    }else{
        //five past period
        if(period >= 10){
            //user selected period is more than 10 days, period cycle past report is month
            //console.log("More than 10 days");
            //past 5 period evaluation 
            pastDate.setMonth(pastDate.getMonth() - 5);
        }else{
            //user selected period is less then 10 days, period cycle past report is week
            //console.log("Less than 10 days");
            pastDate.setDate(pastDate.getDate() - 35);
        }
    }
    var yyyy = pastDate.getFullYear(); // Get the 4-digit year
    var mm = (pastDate.getMonth() + 1).toString().padStart(2, '0'); // Get the month (1-12) and format with a leading zero if necessary
    var dd = pastDate.getDate().toString().padStart(2, '0'); // Get the day of the month and format with a leading zero if necessary
    
    var formattedDate = `${yyyy}-${mm}-${dd}`; // Create the formatted date string

    //console.log("Input Date: "+date+" Output Date: "+toParams(formattedDate));
    return toParams(formattedDate);

}

function evalAndApplyFunction(stringCode,params,operativeTime){
    const dynamicFunction = new Function(stringCode);
    const toApplay = dynamicFunction();
    const result = toApplay(params,operativeTime);
    //console.log("DEBUG: ", result);
    return parseFloat(result.toFixed(2));
}

