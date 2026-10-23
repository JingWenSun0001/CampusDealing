(function(){
  const base=location.protocol==='file:'?'http://127.0.0.1:8000/api':'/api';
  async function request(path,options){
    const response=await fetch(base+path,Object.assign({headers:{'Content-Type':'application/json'}},options||{}));
    let body=null;
    try{body=await response.json()}catch{}
    if(!response.ok)throw new Error(body&&body.error?body.error:'请求失败');
    return body;
  }
  window.AppAPI={
    getPosts:function(params){
      const query=new URLSearchParams(params||{}).toString();
      return request('/posts'+(query?'?'+query:''));
    },
    getPost:function(id){return request('/posts/'+encodeURIComponent(id))},
    createPost:function(post){return request('/posts',{method:'POST',body:JSON.stringify(post)})},
    claimPost:function(id){return request('/posts/'+encodeURIComponent(id)+'/claim',{method:'POST',body:'{}'})},
    getMe:function(){return request('/me')},
    updateProfile:function(profile){return request('/profile',{method:'PUT',body:JSON.stringify(profile)})}
  };
})();
