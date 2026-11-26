// Usernames are immutable unique tags. These rules match the AWS API.
const PATTERN=/^[a-záéíóúüñ][a-záéíóúüñ0-9_]{2,23}$/u;
const RESERVED=new Set(["admin","administrador","boscosong","soporte","support","root","system","sistema","moderador","moderator","staff","aws","cognito"]);
export function normalizeUsername(value){
 return String(value||"").normalize("NFKC").toLocaleLowerCase("es").trim();
}
export function validateUsername(value){
 const username=normalizeUsername(value);
 if(!PATTERN.test(username))return {username,valid:false,message:"Entre 3 y 24 caracteres. Empieza por una letra; usa letras, números o guion bajo."};
 if(RESERVED.has(username))return {username,valid:false,message:"Este nombre está reservado. Elige otro."};
 return {username,valid:true,message:"Nombre válido. Comprobaremos que esté libre al guardarlo."};
}
