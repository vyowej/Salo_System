import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import 'datatables.net-responsive-dt';
import 'datatables.net-fixedheader-dt';
import 'datatables.net-buttons-dt';
import 'datatables.net-buttons/js/buttons.html5.mjs';
import 'datatables.net-select-dt';

import 'datatables.net-dt/css/dataTables.dataTables.css';
import 'datatables.net-responsive-dt/css/responsive.dataTables.css';
import 'datatables.net-fixedheader-dt/css/fixedHeader.dataTables.css';
import 'datatables.net-buttons-dt/css/buttons.dataTables.css';
import 'datatables.net-select-dt/css/select.dataTables.css';

// eslint-disable-next-line react-hooks/rules-of-hooks -- DataTable.use() is DataTables.net's library registration API, not a React Hook.
DataTable.use(DT);

export default DataTable;
