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

/**
 * Interface function to retrieve KPI (Key Performance Indicator) values based on specified parameters.
 *
 * @param {string} kpi - The identifier for the KPI to retrieve.
 * @param {string} startDate - The start date for the KPI calculation period.
 * @param {string} endDate - The end date for the KPI calculation period.
 * @param {boolean} is5Period - A flag indicating whether to calculate for a 5-period cycle.
 * @param {number} cost - The cost value to be used in calculations.
 * @param {number} percentage - The percentage value to be used in calculations.
 * @returns {Promise<number|null>} A promise that resolves to the calculated KPI value or null if an error occurs.
 */
 async function interfaceBody(kpi, startDate, endDate , is5Period, cost, percentage){
  
    //param passed to interface function
    const paramsObj = {
        timeSecond: timeSecond(percentage, new Date(startDate), new Date(endDate)),
        startDatePast: dateCalculator(startDate, [startDate,endDate], is5Period),
        endDatePast:  toParams(startDate),
        startDate: toParams(startDate),
        endDate: toParams(endDate),
        dataTableName: data_table_name
    };

    let kpiValue = null;
    
    const client = await pool.connect();
    // console.log("client on");
    try{  
        const kpiId = toParams(kpi) ;
        const kpiRows = await client.query(kpiColumQuery(kpiId, kpi_table_name));
         // console.log(kpiColumQuery(kpiId, kpi_table_name));
         //console.log(kpiRows);

        //check for children to understand if it's Primary KPI or Secondary KPI
        if(kpiRows.rows[0]['children'] ===  null){
            //kpiRow[0].children = null => kpiRow[0].query => !null
            const retRow = await client.query(replaceWithValue(kpiRows.rows[0]['query'],paramsObj));
            kpiValue = retRow.rows[0]['v'];
            //console.log(kpiValue);
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
                    value: (await interfaceBody(child,startDate,endDate,is5Period,(cost*1000),percentage))
                };
                childArray.push(value);
            }
            //console.log(childArray);
            //console.log(kpiRows.rows[0]['js_fun']);
            
            let operativeTime = Math.ceil(Math.abs(new Date(paramsObj.endDate)- new Date(paramsObj.startDate))/ (1000)); //seconds
            kpiValue = evalAndApplyFunction(kpiRows.rows[0]['js_fun'],childArray, operativeTime, cost);
            ///console.log(kpiValue);
        }//end else
    }catch(e){
        //print error code and detail
        console.error('Error:', e);
    }finally{
        //in each case release client
        client.release();
    }
    return kpiValue;
}

/**
 * Calculate the percentage of time (in seconds) between two dates.
 *
 * @param {number} p - The percentage you want to calculate.
 * @param {Date} sD - The start date.
 * @param {Date} eD - The end date.
 * @returns {number} The calculated percentage of time in seconds.
 */
function timeSecond(p, sD, eD) {
    // Calculate the absolute difference in milliseconds between the start and end dates
    const millisecond = Math.abs(sD - eD);
  
    // Convert milliseconds to seconds and round to the nearest second
    const second = Math.ceil(millisecond / 1000);
  
    // Calculate the percentage of time in seconds based on the provided percentage (p)
    return (second * p) / 100;
  }
  
/**
 * Replace placeholders in the input string with corresponding values from the params object.
 *
 * @param {string} inputString - The input string containing placeholders in the format ${paramName}.
 * @param {object} params - An object containing parameter names as keys and their corresponding values.
 * @returns {string} The modified string with placeholders replaced by values.
 */
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

/**
 * Wrap the input string with single quotes and return the resulting string.
 *
 * @param {string} str - The input string to be wrapped with single quotes.
 * @returns {string} The input string enclosed in single quotes.
 */
function toParams(str){
    return ("'"+str+"'"); 
}

/**
 * Generate a SQL query to search for a specific record in a KPI table based on KPI ID and table name.
 *
 * @param {number} kpi_id - The KPI ID to search for in the table.
 * @param {string} table_name - The name of the table where the search will be performed.
 * @returns {string} A SQL query string to search for the specified KPI record in the given table.
 */
function kpiColumQuery (kpi_id, table_name){ 
    return ('select * from '+table_name +" where id ="+ kpi_id);
}

/**
 * Calculate a date in the past based on the specified period, measuring the difference with the previous period.
 *
 * @param {string} date - The reference date for the calculation.
 * @param {string[]} [strD, endD] - An array representing the start and end dates of the selected period.
 * @param {boolean} flag - A flag indicating whether to calculate for one past period (false) or five past periods (true).
 * @returns {string} A formatted date string representing the calculated date in the past.
 */
function dateCalculator(date, [strD, endD], flag){
    const s = new Date(strD);
    const e = new Date(endD);
    //day subtraction is measured by milliseconds
    const period = Math.ceil(Math.abs(e-s)/ (1000*60*60*24)); 
    
    var pastDate = new Date (date);
    if(!flag){
        //one past period
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

/**
 * Execute a dynamically created function based on the provided string code, passing in parameters,
 * operative time, and cost, and return the result rounded to two decimal places.
 *
 * @param {string} stringCode - The JavaScript code as a string that defines a function.
 * @param {any} params - Parameters to be passed to the dynamically created function.
 * @param {any} operativeTime - The operative time value to be passed to the dynamically created function.
 * @param {number} cost - The cost value to be passed to the dynamically created function.
 * @returns {number} The result of the executed function, rounded to two decimal places.
 */
function evalAndApplyFunction(stringCode,params,operativeTime,cost){
    // Create a dynamic function from the provided stringCode using the Function constructor.
    const dynamicFunction = new Function(stringCode);
     // Invoke the dynamic function to get a function to apply later
    const toApplay = dynamicFunction();
    // Call the obtained function with the provided params and operativeTime.
    const result = toApplay(params,operativeTime,cost);
    //console.log("DEBUG: ", result);
    // Round the result to two decimal places and parse it as a floating-point number.
    return parseFloat(result.toFixed(2));
}



async function interfaceMain(){
    let kpi = "estimate_tot_cost";
    const toPrint = await interfaceBody(kpi,'2023-06-01','2023-07-01',true, 0.25,20);
    console.log(kpi+": "+toPrint);

}interfaceMain();

