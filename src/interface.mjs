process.on('uncaughtException', function (err) {
    console.log(err);
});

//read connection parameters from .env file
import { config } from 'dotenv';
config({ path: 'development.env' });
const databaseConfig = {
    user: process.env.DB_USER,
    host: process.env.HOST,
    database: process.env.DATA,
    password: process.env.PASSWORD,
    port: process.env.PORT
};
//save table name 
const kpi_table_name = process.env.KPI_TABLE_NAME;
const data_table_name = process.env.DATA_TABLE_NAME;


import pg from "pg";
const { Pool } = pg;



//create a pool with .env param
const pool = new Pool(databaseConfig);
const defaultValue = {
    percentage: 50,
    cost : 0,
    howManyPeriod : 1
};
/**
 * Interface function to retrieve KPI (Key Performance Indicator) values based on specified parameters.
 *
 * @param {string} kpi - The identifier for the KPI to retrieve.
 * @param {string} startDate - The start date for the KPI calculation period.
 * @param {string} endDate - The end date for the KPI calculation period.
 * @param {number} howManyPeriod - A flag indicating whether to calculate for a 5-period cycle.
 * @param {number} cost - The cost value to be used in calculations.
 * @param {number} percentage - The percentage value to be used in calculations.
 * @returns {Promise<number|null>} A promise that resolves to the calculated KPI value or null if an error occurs.
 */
 async function interfaceBody(kpi, startDate, endDate , howManyPeriod, cost, percentage){
    //set default value
    if (percentage === null){
        percentage =defaultValue.percentage;
    }
    if(howManyPeriod === null){
        howManyPeriod = defaultValue.howManyPeriod;
    }
    if(cost === null){
        cost = defaultValue.cost;
    }
    //param passed to interface function
    const paramsObj = {
        timeSecond: timeSecond(percentage, new Date(startDate), new Date(endDate)),
        startDatePast: dateCalculator(startDate, [startDate,endDate], howManyPeriod),
        endDatePast:  toParams(startDate),
        startDate: toParams(startDate),
        endDate: toParams(endDate),
        dataTableName: data_table_name
    };
    let kpiValue = null;
    const client = await pool.connect();
    try{
        //ask to print KPI id and his description
        if(kpi==="documentation"){
            const kpiTable = await client.query(kpiTableQuery(kpi_table_name));
            var toPrint = [];
            for( const KPI of kpiTable.rows){
                    const v ={
                        id: KPI['id'],
                        description:KPI['description'],
                        more: (KPI['query'] === null) ? {children: JSON.stringify(KPI['children']), js_fun:KPI['js_fun']} : {query: KPI['query']}
                    };

                toPrint.push(v);
            }
            return toPrint;
        }else{
            //ask for single KPI or table
            const kpiId = toParams(kpi) ;
            const kpiRows = await client.query(kpiColumQuery(kpiId, kpi_table_name));
            //check for children to understand if it's Atomic KPI or Composed KPI
            if(kpiRows.rows[0]['children'] ===  null){
                //kpiRow[0].children === null => kpiRow[0].query !== null || kpiRow[0].query ==== null, need to check
                if(kpiRows.rows[0]['query'] === null ){
                    //kpiRow[0].query ==== null
                    return "Can't calculate KPI";
                }
                // kpiRow[0].query !== null
                const retRow = await client.query(replaceWithValue(kpiRows.rows[0]['query'],paramsObj));
                if(kpi.includes(table)){
                    //if inside KPI id there is 'table' substring it menas the interface need to return an entire table:
                    var table = [];
                    for (const r of kpiRows.rows){
                        table.push(r['v']);
                    }
                   return table;
                }else{
                    return retRow.rows[0]['v'];
                }
                //never reach
                throw new Error("Ureachable codeLine.");
            }else{
                //children is !null => query === null
                /* the interface need to read which are the children, so it can ask for 
                the value to use in the function aqcuired by read function
                colum from kpi table */ 
                var  childArray = [];
                for(var child of kpiRows.rows[0]['children']){
                    //console.log(replaceWithValue(childRetRow.rows[0]['query'], paramsObj));
                    var value ={
                        id: child,
                        value: (await interfaceBody(child,startDate,endDate,howManyPeriod,(cost*1000),percentage))
                    };
                    childArray.push(value);
                }               
                let operativeTime = Math.ceil(Math.abs(new Date(paramsObj.endDate)- new Date(paramsObj.startDate))/ (1000)); //seconds
                return evalAndApplyFunction(kpiRows.rows[0]['js_fun'],childArray, operativeTime, cost);
            }//end else
        }
    }catch(e){
        //print error code and detail
        console.error('Error:', e);
    }finally{
        //in each case release client
        client.release();
    }
}
/**
 * Function to write  query to print entire kpi table 
 * 
 * @param {*} kpiTable  
 * @returns query
 */
function kpiTableQuery(kpiTable){
    return "select id,description,query,children,js_fun from "+ kpiTable;
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
 * Generate a SQL query to search for a specific record 
 * in a KPI table based on KPI ID and table name.
 *
 * @param {number} kpi_id - The KPI ID to search for in the table.
 * @param {string} table_name - The name of the table where the search will be performed.
 * @returns {string} A SQL query string to search for the specified
 *                   KPI record in the given table.
 */
function kpiColumQuery (kpi_id, table_name){ 
    return ('select * from '+table_name +" where id ="+ kpi_id);
}

/**
 * Calculate a date in the past based on the specified period, measuring the difference with the previous period.
 *
 * @param {string} date - The reference date for the calculation.
 * @param {string[]} [strD, endD] - An array representing the start and end dates of the selected period.
 * @param {number} howManyPeriod - A value indicating how may past periods to calculate.
 * @returns {string} A formatted date string representing the calculated date in the past.
 */
function dateCalculator(date, [strD, endD], howManyPeriod){
    const s = new Date(strD);
    const e = new Date(endD);
    //day subtraction is measured by milliseconds
    const period = Math.ceil(Math.abs(e-s)/ (1000*60*60*24)); 
    
    var pastDate = new Date (date);
    if(howManyPeriod === 1){
        //one past period
        pastDate.setDate(pastDate.getDate()-period);
    }else{
        //more than one past period
        if(period >= 10){
            //user selected period is more than 10 days, period cycle past report is in month
            pastDate.setMonth(pastDate.getMonth() - howManyPeriod);
        }else{
            //user selected period is less then 10 days, period cycle past report is in week
            pastDate.setDate(pastDate.getDate() - (7*howManyPeriod));
        }
    }
    // Get the 4-digit year
    var yyyy = pastDate.getFullYear(); 
    // Get the month (1-12) and format with a leading zero if necessary
    var mm = (pastDate.getMonth() + 1).toString().padStart(2, '0'); 
     // Get the day of the month and format with a leading zero if necessary
    var dd = pastDate.getDate().toString().padStart(2, '0');
    // Create the formatted date string
    var formattedDate = `${yyyy}-${mm}-${dd}`; 
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
 * @returns {any} The result of the executed function, if float rounded to two decimal places.
 */
function evalAndApplyFunction(stringCode,params,operativeTime,cost){
    // Create a dynamic function from the provided stringCode using the Function constructor.
    const dynamicFunction = new Function(stringCode);
     // Invoke the dynamic function to get a function to apply later
    const toApplay = dynamicFunction();
    // Call the obtained function with the provided params and operativeTime.
    const result = toApplay(params,operativeTime,cost);
    //console.log("DEBUG: ", result);
    if(Number.isFinite(result) && !Number.isInteger(result)){
        return Number((parseFloat(result)).toFixed(2)) ;
    }
    return result;
}


/**
 * Caller to Interface body function.
 *
 * @param {string} kpi - The identifier for the KPI to retrieve.
 * @param {string} startDate - The start date for the KPI calculation period.
 * @param {string} endDate - The end date for the KPI calculation period.
 * @param {boolean} howManyPeriod - A value indicating how many past period to calculate. (ignored if it's not necessary);
 * @param {number} cost - The cost value to be used in calculations.
 * @param {number} percentage - The percentage value to be used in calculations.
 * @returns {Promise<number|null>} A promise that resolves to the calculated KPI value or null if an error occurs.
 */
export default async function KPI_Table_Interface(kpi, startDate, endDate, pastPeriodAmount, cost_kWh, percentage){
    const retunFromDB = await interfaceBody(kpi,startDate,endDate,pastPeriodAmount,cost_kWh,percentage);
    pool.end()
    return retunFromDB;
};
  


