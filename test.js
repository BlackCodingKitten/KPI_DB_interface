import KPI_Table_Interface from "./interface.mjs";

 async function main () {
    const toPrint = await KPI_Table_Interface("machine_usage_trend", '2023-05-02', '2023-05-09', 5, null, null);
    console.log(toPrint);
}

main();