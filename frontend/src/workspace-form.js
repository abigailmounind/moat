// Shared form validation and visible feedback for long workspace forms.
export function validateWorkspaceDraft(kind,draft){
 if(!draft.name.trim())return {message:'请填写名称。',field:'name'};
 if(draft.name.length>120)return {message:'名称请控制在 120 字以内。',field:'name'};
 if(kind==='plans'){
  if(!draft.capitals.length)return {message:'请选择至少一项准备建设的资本，再保存计划。',field:'capitals'};
  const empty=draft.milestones.find(m=>!m.name.trim());
  if(empty)return {message:'有一个里程碑还没有名称，请填写或移除后保存。',field:`m-name-${empty.id}`};
 }
 return null;
}
export function showFormError(form,message,field){
 const node=form.querySelector('[data-form-error]');
 if(node){node.textContent=message;node.hidden=false;}
 const input=field?form.elements.namedItem(field):null;
 const control=input?.focus?input:input?.[0];
 if(control){control.setAttribute('aria-invalid','true');control.focus();}
 else node?.focus();
}
