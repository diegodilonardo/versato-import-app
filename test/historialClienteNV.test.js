const test=require('node:test'),assert=require('node:assert/strict');const {cambiosDelCliente}=require('../public/historialClienteNV');
test('reconstruye la cadena de clientes conservando fecha, motivo y cantidades',()=>{
 const a={anterior:'12835',nuevo:'907011',fecha:'2026-11-24T12:00:00Z',motivo:'Cliente incorrecto',cajasPacking:2,paresPacking:24},b={anterior:'907011',nuevo:'999',motivo:'Segunda corrección'},otro={anterior:'500',nuevo:'600'};
 const datos=[a,otro,b],original=JSON.stringify(datos);assert.deepEqual(cambiosDelCliente(datos,'999'),[a,b]);assert.equal(JSON.stringify(datos),original);assert.equal(cambiosDelCliente(datos,'907011')[0].cajasPacking,2);
});
test('incluye varios orígenes reunidos en un destino y excluye correcciones de otras NV',()=>{
 const a={anterior:'001',nuevo:'003'},b={anterior:'002',nuevo:'003'},c={anterior:'009',nuevo:'010'};assert.deepEqual(cambiosDelCliente([a,c,b],'003'),[a,b]);assert.deepEqual(cambiosDelCliente([a,c,b],'010'),[c]);
});
test('una NV sin corrección no muestra advertencia y respeta ceros del código',()=>{
 assert.deepEqual(cambiosDelCliente(undefined,'001'),[]);assert.deepEqual(cambiosDelCliente([{anterior:'2',nuevo:'001'}],'1'),[]);assert.equal(cambiosDelCliente([{anterior:'2',nuevo:'001'}],'001').length,1);
});
