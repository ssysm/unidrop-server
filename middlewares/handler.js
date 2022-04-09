handler = (res,err,docs)=>{
    if(err){
      res.status(500).json({
        success:false,
        response:err
      })
    }else{
      if(!docs && (docs !== 0)){
        res.status(400).json({
          success:false,
          response: null
        })
      }else{
        res.status(200).json({
          success: true,
          response: docs
        })
      }
    }
};
  
module.exports = handler;