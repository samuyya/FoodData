// recetas de solo lectura para todos los hogares. los ingredientes con "?" al final son opcionales.
// los nombres de ingredientes deben coincidir con catalogo-ingredientes.js para que el cruce funcione
const R = (id, nombre, categoria, ingredientes, porciones, pasos) => ({
  id, nombre, categoria, porciones, propia: false,
  ingredientes: ingredientes.split(',').map(x => {
    const t = x.trim();
    return t.endsWith('?') ? { nombre: t.slice(0, -1), opcional: true } : { nombre: t, opcional: false };
  }),
  pasos: pasos.split('|')
});

module.exports = [
  R('hogao', 'Hogao colombiano', 'Salsa', 'tomate,cebolla larga,aceite,comino?,sal', 4, 'Pica el tomate y la cebolla larga en cuadritos.|Sofríe la cebolla en aceite a fuego medio hasta que esté blanda.|Agrega el tomate, la sal y el comino. Cocina 10 minutos, moviendo de vez en cuando.'),
  R('aji', 'Ají colombiano', 'Salsa', 'cilantro,cebolla larga,limón,ají picante,agua,sal', 6, 'Pica fino el cilantro, la cebolla y el ají.|Mezcla con el jugo de limón, un poco de agua y sal.|Deja reposar 15 minutos antes de servir.'),
  R('guacamole', 'Guacamole', 'Salsa', 'aguacate,limón,cebolla,tomate?,cilantro?,sal', 4, 'Machaca el aguacate con un tenedor.|Agrega cebolla y tomate picados, jugo de limón y sal.|Mezcla y sirve de inmediato para que no se oscurezca.'),
  R('salsa-rosada', 'Salsa rosada', 'Salsa', 'mayonesa,salsa de tomate,limón?', 6, 'Mezcla partes iguales de mayonesa y salsa de tomate.|Agrega unas gotas de limón.|Refrigera hasta servir.'),
  R('chimichurri', 'Chimichurri', 'Salsa', 'perejil,ajo,vinagre,aceite,orégano?,sal', 6, 'Pica fino el perejil y el ajo.|Mezcla con aceite, vinagre, orégano y sal.|Deja reposar 30 minutos para que tome sabor.'),
  R('salsa-tomate', 'Salsa de tomate casera', 'Salsa', 'tomate,cebolla,ajo?,azúcar,aceite,sal', 6, 'Sofríe la cebolla y el ajo en aceite.|Agrega el tomate picado, una pizca de azúcar y sal.|Cocina 20 minutos a fuego bajo y licúa.'),
  R('jugo-lulo', 'Jugo de lulo', 'Bebida', 'lulo,azúcar,agua', 3, 'Parte los lulos por la mitad y saca la pulpa con una cuchara.|Licúa con agua y cuela.|Endulza al gusto y sirve frío.'),
  R('jugo-maracuya', 'Jugo de maracuyá', 'Bebida', 'maracuyá,azúcar,agua', 3, 'Saca la pulpa de los maracuyás.|Licúa con agua solo unos segundos, para no moler las semillas, y cuela.|Endulza y sirve con hielo.'),
  R('jugo-mora', 'Jugo de mora en leche', 'Bebida', 'mora,leche,azúcar', 2, 'Lava bien la mora.|Licúa con la leche fría y el azúcar.|Cuela si lo quieres sin semillas y sirve.'),
  R('jugo-guanabana', 'Jugo de guanábana', 'Bebida', 'guanábana,leche,azúcar', 3, 'Retira la cáscara y las semillas de la guanábana.|Licúa la pulpa con leche y azúcar.|Sirve frío.'),
  R('limonada-coco', 'Limonada de coco', 'Bebida', 'limón,crema de coco,azúcar,agua', 3, 'Exprime los limones.|Licúa el jugo con la crema de coco, agua, azúcar y hielo.|Sirve de inmediato.'),
  R('aguapanela', 'Aguapanela con limón', 'Bebida', 'panela,limón,agua', 4, 'Hierve el agua con la panela partida hasta que se disuelva.|Deja entibiar o enfriar.|Agrega jugo de limón y sirve.'),
  R('jugo-corozo', 'Jugo de corozo', 'Bebida', 'corozo,azúcar,agua', 4, 'Lava el corozo y hiérvelo en agua unos 15 minutos.|Deja enfriar, licúa suave y cuela.|Endulza y refrigera.'),
  R('avena', 'Avena fría', 'Bebida', 'avena,leche,canela,azúcar', 4, 'Cocina la avena en la leche con la canela, moviendo, unos 10 minutos.|Deja enfriar.|Licúa, endulza y sirve bien fría.'),
  R('arroz-huevo', 'Arroz con huevo', 'Plato', 'arroz,huevo,aceite,sal,cebolla?', 2, 'Prepara el arroz como siempre.|Fríe los huevos en aceite caliente.|Sirve el huevo encima del arroz.'),
  R('pericos', 'Huevos pericos', 'Plato', 'huevo,tomate,cebolla larga,aceite,sal', 2, 'Sofríe el tomate y la cebolla picados en aceite.|Agrega los huevos batidos con sal.|Revuelve a fuego medio hasta que cuajen.'),
  R('sudado-pollo', 'Sudado de pollo', 'Plato', 'pollo,papa,tomate,cebolla,ajo?,cilantro?,aceite,comino?', 4, 'Sofríe cebolla, tomate y ajo picados en aceite.|Agrega el pollo en presas y séllalo 5 minutos.|Añade la papa en trozos y un poco de agua. Cocina tapado 30 minutos y termina con cilantro.'),
  R('arroz-pollo', 'Arroz con pollo', 'Plato', 'arroz,pollo,zanahoria,arveja?,cebolla,aceite', 4, 'Cocina el pollo en agua con sal y desmenúzalo. Guarda el caldo.|Sofríe la cebolla y la zanahoria, agrega el arroz y el pollo.|Añade el caldo y cocina hasta que el arroz seque.'),
  R('lentejas', 'Sopa de lentejas', 'Plato', 'lentejas,zanahoria,cebolla,papa?,ajo?,aceite', 4, 'Sofríe la cebolla y el ajo en aceite.|Agrega las lentejas lavadas, la zanahoria, la papa y agua.|Cocina 40 minutos y sazona con sal.'),
  R('frijoles', 'Frijoles con arroz', 'Plato', 'frijoles,arroz,cebolla,tomate,aceite', 4, 'Cocina los frijoles hasta que estén blandos (mejor si los remojas la noche anterior).|Prepara un hogao con cebolla y tomate.|Mezcla el hogao con los frijoles y sirve con arroz.'),
  R('patacones', 'Patacones con hogao', 'Plato', 'plátano verde,aceite,tomate,cebolla larga,sal', 3, 'Pela el plátano verde, córtalo en trozos y fríelos.|Aplástalos, vuelve a freírlos hasta que doren y sálalos.|Sirve con hogao encima.'),
  R('tortilla-papa', 'Tortilla de papa', 'Plato', 'papa,huevo,cebolla,aceite,sal', 3, 'Fríe la papa y la cebolla en rodajas finas hasta que ablanden.|Mézclalas con los huevos batidos y sal.|Cuaja la tortilla en la sartén por ambos lados.'),
  R('pasta-tomate', 'Pasta con salsa de tomate', 'Plato', 'pasta,tomate,cebolla,ajo?,queso?,aceite', 3, 'Cocina la pasta en agua con sal.|Sofríe cebolla y ajo, agrega el tomate picado y cocina 10 minutos.|Mezcla con la pasta y agrega queso rallado.'),
  R('carne-molida', 'Carne molida guisada', 'Plato', 'carne molida,tomate,cebolla,zanahoria?,ajo?,aceite', 4, 'Sofríe cebolla, ajo y tomate en aceite.|Agrega la carne y cocina 15 minutos, desmenuzándola.|Añade zanahoria rallada y sazona.'),
  R('arepa-queso', 'Arepa con queso', 'Plato', 'harina de maíz,queso,mantequilla?,sal', 2, 'Mezcla la harina con agua tibia y sal hasta tener una masa suave.|Forma las arepas y ásalas por ambos lados.|Ábrelas y rellénalas con queso y mantequilla.'),
  R('crema-ahuyama', 'Crema de ahuyama', 'Plato', 'ahuyama,cebolla,leche,mantequilla?', 4, 'Sofríe la cebolla en mantequilla.|Cocina la ahuyama en trozos con agua hasta que ablande.|Licúa todo con leche, sazona y sirve caliente.'),
  R('arroz-leche', 'Arroz con leche', 'Postre', 'arroz,leche,azúcar,canela', 4, 'Cocina el arroz en agua con canela hasta que se ablande.|Agrega la leche y cocina moviendo seguido.|Endulza y deja espesar. Sirve frío o caliente.'),
  R('maduro-queso', 'Plátano maduro al horno con queso', 'Postre', 'plátano maduro,queso,mantequilla?', 3, 'Haz un corte a lo largo del plátano sin pelarlo del todo.|Rellena con queso y un poco de mantequilla.|Hornea 20 minutos a 180 grados.')
];
