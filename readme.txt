sample category

POST /api/categories
{
  "name": "Mobiles",
  "description": "Smartphones and accessories"
}

sample product
// category must be an existing Category _id

{
  "name": "iPhone 16 Pro",
  "description": "256 GB Natural Titanium",
  "price": 119999,
  "stock": 20,
  "category": "6878c8a4df2fd53df67d1222",
  "brand": "Apple",
  "image": "iphone16.jpg"
}



// cart + checkout now require: Authorization: Bearer <token from login/register>
// userId is taken from the token, not the request body

// cart sample resonse
add
POST /api/cart/add

{
    "productId":"6878c8a4df2fd53df67d1222",
    "quantity":2
}


response
{
    "success": true,
    "message": "Product added to cart",
    "data": {
        "_id": "...",
        "user": "...",
        "items": [
            {
                "product": "...",
                "quantity": 2
            }
        ]
    }
}


get cart
GET /api/cart

response
{
    "success": true,
    "totalItems": 1,
    "grandTotal": 239998,
    "data": {
        "_id": "...",
        "user": "...",
        "items": [
            {
                "product": { "...": "populated product" },
                "quantity": 2
            }
        ]
    }
}


update quantity
PUT /api/cart/update

{
    "productId":"6878c8a4df2fd53df67d1222",
    "quantity":3
}

response
{
    "success": true,
    "message": "Quantity updated",
    "data": { "...": "cart" }
}


remove item
DELETE /api/cart/remove/6878c8a4df2fd53df67d1222

response
{
    "success": true,
    "message": "Item removed"
}


clear cart
DELETE /api/cart/clear

response
{
    "success": true,
    "message": "Cart cleared"
}

order

{
    "paymentMethod":"COD",
    "shippingAddress":{
        "fullName":"John Doe",
        "phone":"9876543210",
        "address":"12 MG Road",
        "city":"Bangalore",
        "state":"Karnataka",
        "country":"India",
        "pincode":"560001"
    }
}


