// Cada grupo acepta cualquiera de sus alias. Todos los grupos son obligatorios.
// Packing List: firma inicial basada en los campos del proceso anterior;
// confirmar contra un archivo real antes de ampliar estos alias.
module.exports = [
  { tipo: 'PACKING_LIST', nombre: 'Packing List', campos: [
    ['STYLE'], ['MATERIAL CODE'], ['COLOR CODE'], ['SIZE RUN']
  ] },
  { tipo: 'CODIGOS_BARRA', nombre: 'Códigos de Barra', campos: [
    ['CAJA MASTER'], ['LINHA'], ['REFERENCIA'], ['CABEDAL'], ['COR'],
    ['TAMANHO EXTERNO'], ['QUANTIDADE GRADE'], ['TOTAL PARES'], ['LOJAS'],
    ['INVOICE', 'FACTURA', 'FATURA'], ['CODIGO DE BARRA VERSATO']
  ] },
  { tipo: 'EAN', nombre: 'EAN', campos: [
    ['Descrição Marca'], ['Linha/Ref'], ['Cabedal'], ['Cor'], ['Numeração Ext'], ['Ean 13']
  ] },
  { tipo: 'FACTURA', nombre: 'Factura', campos: [
    ['STYLE'], ['MATERIAL CODE'], ['COLOR CODE'], ['BOXES'], ['PAIRS'], ['UNIT'], ['AMOUNT']
  ] }
];
